"""
app.py (개선판)

변경 요약:
- _build_google_sheet_csv_url / _download_text 로직 유지
- 라우트를 도메인별 Blueprint로 분리 (auth, management, new_pages)
- 중복 코드(old/new 라우트 패턴)를 _render 헬퍼로 통합
- 오류 핸들러(404, 500) 추가
- API 엔드포인트에 Content-Type 검증 및 에러 응답 구조 통일
"""

from flask import Flask, Blueprint, jsonify, redirect, render_template, request, send_file, url_for
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote, urlparse
from urllib.request import Request, urlopen
import io, re, zipfile


app = Flask(__name__)

import os, time
# 서버 시작 시각 — 운영 배포 시 fallback
APP_VERSION = str(int(time.time()))
# static/ 폴더 최신 mtime 캐시 (요청마다 walk 비용 줄임, 5초 캐시)
_static_mtime_cache = {'value': 0, 'computed_at': 0}

def _compute_static_mtime():
    now = time.time()
    if now - _static_mtime_cache['computed_at'] < 5:
        return _static_mtime_cache['value']
    static_dir = os.path.join(os.path.dirname(__file__), 'static')
    latest = 0
    try:
        for root, dirs, files in os.walk(static_dir):
            dirs[:] = [d for d in dirs if not d.startswith('.') and d != 'node_modules']
            for f in files:
                try:
                    mt = os.path.getmtime(os.path.join(root, f))
                    if mt > latest: latest = mt
                except OSError:
                    pass
    except Exception:
        pass
    _static_mtime_cache['value'] = latest
    _static_mtime_cache['computed_at'] = now
    return latest

@app.context_processor
def inject_app_version():
    # 항상 static mtime 사용 (운영도 큰 부담 없음 — 5초 캐시)
    mtime = _compute_static_mtime()
    return {'app_version': str(int(mtime)) if mtime else APP_VERSION}

@app.after_request
def add_cache_headers(response):
    ctype = response.content_type or ''
    path = request.path or ''
    # HTML: no-cache (재검증 필요, bfcache는 허용)
    if 'text/html' in ctype:
        response.headers['Cache-Control'] = 'no-cache'
    # 정적 파일
    elif path.startswith('/static/') and not path.endswith('sw.js') and not path.endswith('manifest.json'):
        # ?v= 쿼리가 있는 요청만 immutable 1년 (버전 박혀있어 안전)
        # 없으면 짧게 — 매번 재검증해서 변경 즉시 반영
        if request.args.get('v'):
            response.headers['Cache-Control'] = 'public, max-age=31536000, immutable'
        else:
            response.headers['Cache-Control'] = 'no-cache, must-revalidate'
    # SW와 manifest: 캐시 안함
    elif path.endswith('sw.js') or path.endswith('manifest.json'):
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    return response


# ─── 모바일 판별 ─────────────────────────────────────────────────────────────

import functools

_MOBILE_RE = re.compile(r'Mobi|Android|iPhone|iPad|iPod', re.IGNORECASE)

def _is_mobile():
    ua = request.headers.get('User-Agent', '')
    return bool(_MOBILE_RE.search(ua))


# ─── 구글시트 유틸 ────────────────────────────────────────────────────────────

def _build_google_sheet_csv_url(source_url: str) -> str:
    text = str(source_url or '').strip()
    if not text:
        raise ValueError('차종 마스터 링크를 입력하세요.')

    parsed = urlparse(text)
    if 'docs.google.com' not in (parsed.netloc or ''):
        raise ValueError('구글시트 링크만 사용할 수 있습니다.')

    match = re.search(r'/spreadsheets/d/([a-zA-Z0-9-_]+)', parsed.path or '')
    if not match:
        raise ValueError('구글시트 링크 형식을 확인하세요.')

    sheet_id = match.group(1)
    query = parse_qs(parsed.query or '')
    fragment = parse_qs((parsed.fragment or '').replace('#', '&'))
    gid = query.get('gid', [None])[0] or fragment.get('gid', [None])[0] or '0'

    if '/export' in parsed.path:
        return text

    if '/pubhtml' in parsed.path or '/pub' in parsed.path:
        base_path = parsed.path.replace('/pubhtml', '/pub').replace('/pub', '/pub')
        return f'https://docs.google.com{base_path}?output=csv&gid={quote(str(gid))}'

    return f'https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid={quote(str(gid))}'


MAX_DOWNLOAD_BYTES = 10 * 1024 * 1024  # 10MB

def _download_text(url: str) -> str:
    request_obj = Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urlopen(request_obj, timeout=20) as response:
        length = response.headers.get('Content-Length')
        if length and int(length) > MAX_DOWNLOAD_BYTES:
            raise ValueError('데이터가 너무 큽니다 (최대 10MB)')
        charset = response.headers.get_content_charset() or 'utf-8'
        content_type = response.headers.get('Content-Type', '')
        body = response.read(MAX_DOWNLOAD_BYTES + 1)
        if len(body) > MAX_DOWNLOAD_BYTES:
            raise ValueError('데이터가 너무 큽니다 (최대 10MB)')
        body = body.decode(charset, errors='replace')
        # CSV로 명시되거나, HTML이 아니면 통과
        if 'text/csv' in content_type:
            return body
        if '<!DOCTYPE html' in body or '<html' in body.lower():
            raise ValueError('링크 공개 범위를 확인하세요. 링크가 있는 사용자에게 공개된 구글시트여야 합니다.')
        return body


# ─── API 에러 응답 헬퍼 ──────────────────────────────────────────────────────

def _api_error(message: str, status: int = 400):
    return jsonify({'ok': False, 'message': message}), status

def _require_json():
    """POST API에서 Content-Type: application/json 강제"""
    if not request.is_json:
        return _api_error('Content-Type must be application/json', 415)
    return None


# ─── Blueprint: 인증 ─────────────────────────────────────────────────────────

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/login')
def login():
    return render_template('login.html', page_title='로그인')

@auth_bp.route('/signup')
def signup():
    return render_template('signup.html', page_title='회원가입')

@auth_bp.route('/reset-password')
def reset_password():
    return render_template('reset-password.html', page_title='비밀번호재설정')


# ─── Blueprint: 페이지 ───────────────────────────────────────────────────────

pages_bp = Blueprint('pages', __name__)

_NEW_ROUTES = [
    ('/home',          'pages/home.html',       '홈'),
    ('/product-list',  'pages/product.html',    '상품목록'),
    ('/chat',          'pages/chat.html',       '대화'),
    ('/contract',      'pages/contract.html',   '계약'),
    ('/settlement',    'pages/settlement.html', '정산'),
    ('/product-new',   'pages/stock.html',      '재고'),
    ('/terms',         'pages/policy.html',     '정책'),
    ('/partner',       'pages/partner.html',    '파트너'),
    ('/member',        'pages/member.html',     '회원'),
    ('/admin',         'pages/admin.html',      '관리자'),
    ('/settings',      'pages/settings.html',   '설정'),
    ('/codes',         'code-manage.html',              '코드관리'),
    ('/request',       'request-manage.html',           '요청하기'),
    ('/upload-center', 'pages/upload-center.html',      '업로드센터'),
    ('/download-center', 'pages/download-center.html',  '파일센터'),
]

def _make_new_view(template: str, title: str):
    """데스크탑 전용 — 모바일 사용자는 /m/ 으로 리다이렉트"""
    def view():
        if _is_mobile():
            mobile_path = _MOBILE_REDIRECT_MAP.get(template)
            if mobile_path:
                return redirect(mobile_path)
        return render_template(template, page_title=title)
    return view

# 데스크탑 → 모바일 리다이렉트 매핑
_MOBILE_REDIRECT_MAP = {
    'pages/product.html':  '/m/product-list',
    'pages/chat.html':     '/m/chat',
    'pages/contract.html': '/m/contract',
    'pages/settings.html': '/m/settings',
}

# ─── 공유 이미지 캐시 (in-memory, 서버 재시작 시 휘발) ────────────────────
# 카탈로그 공유 링크의 OG:image용 — 클라가 POST로 product_id ↔ image_url 등록
_share_image_cache = {}

@app.route('/api/share/image', methods=['POST'])
def api_share_image_register():
    from flask import request as req
    data = req.get_json(silent=True) or {}
    pid = str(data.get('id') or '').strip()
    img = str(data.get('img') or '').strip()
    if not pid or not img:
        return ('', 400)
    _share_image_cache[pid] = img
    # 메모리 보호 — 1000개 넘으면 가장 오래된 것부터 제거
    if len(_share_image_cache) > 1000:
        for k in list(_share_image_cache.keys())[:200]:
            _share_image_cache.pop(k, None)
    return ('', 204)


@pages_bp.route('/catalog')
def catalog_view():
    from flask import request as req
    provider = req.args.get('provider', '')
    share_id = req.args.get('id', '')
    agent = req.args.get('a', '')
    car_title = req.args.get('t', '')
    company = req.args.get('c', '')
    agent_name = req.args.get('n', '')
    agent_position = req.args.get('pos', '')
    # 이미지: 개별 매물은 차량 사진 캐시, 없으면 카탈로그 기본 썸네일 (FREE/PASS)
    cached_img = _share_image_cache.get(share_id) if share_id else None
    og_image = cached_img or (req.url_root.rstrip('/') + '/static/og-catalog.svg')
    # 공급사 코드 → 공급사명 조회
    provider_name = ''
    if provider:
        try:
            import urllib.request as _ur, json as _js
            _fb = f'https://freepasserp3-default-rtdb.asia-southeast1.firebasedatabase.app/partners/{provider}/partner_name.json'
            with _ur.urlopen(_ur.Request(_fb, headers={'User-Agent': 'Mozilla/5.0'}), timeout=5) as _r:
                provider_name = _js.loads(_r.read().decode('utf-8')) or ''
        except Exception:
            provider_name = ''
    agent_part = ' '.join([s for s in [agent_name, agent_position] if s])
    agent_suffix = f' - {agent_part}' if agent_part else ''
    company_suffix = ''
    if share_id and car_title:
        title = f'{car_title}{company_suffix}'
    elif share_id:
        title = f'상품 안내{agent_suffix}{company_suffix}'
    elif provider:
        display_provider = provider_name or provider
        title = f'{display_provider} 상품{agent_suffix}{company_suffix}'
    else:
        title = f'전체상품{agent_suffix}{company_suffix}'
    custom_desc = req.args.get('d', '')
    og_desc = custom_desc or '장기렌터카 구독서비스 영업전용 ERP'
    if _is_mobile():
        return render_template('mobile/catalog.html', page_title='카탈로그', og_title=title, og_desc=og_desc, og_image=og_image)
    return render_template('pages/catalog.html', page_title=title, og_title=title, og_desc=og_desc, og_image=og_image)

for _path, _tpl, _title in _NEW_ROUTES:
    _ep = _path.lstrip('/').replace('-', '_').replace('/', '_')
    pages_bp.add_url_rule(_path, endpoint=_ep, view_func=_make_new_view(_tpl, _title))


# ─── Blueprint: 모바일 전용 (/m/*) ───────────────────────────────────────────

mobile_bp = Blueprint('mobile', __name__, url_prefix='/m')

_MOBILE_ROUTES = [
    ('/product-list', 'mobile/product.html',         '상품목록'),
    ('/product-list/<product_id>', 'mobile/product-detail.html', '상품상세'),
    ('/chat',         'mobile/chat.html',            '대화'),
    ('/chat/<room_id>', 'mobile/chat-room.html',     '대화방'),
    ('/contract',     'mobile/contract.html',        '계약'),
    ('/contract/<contract_code>', 'mobile/contract-form.html', '계약상세'),
    ('/settings',     'mobile/settings.html',        '설정'),
]

def _make_mobile_view(template: str, title: str, has_id: bool = False):
    def view(**kwargs):
        return render_template(template, page_title=title, **kwargs)
    return view

for _mp in _MOBILE_ROUTES:
    _path, _tpl, _title = _mp
    _ep = 'm_' + _path.lstrip('/').replace('-', '_').replace('/', '_').replace('<', '').replace('>', '')
    mobile_bp.add_url_rule(_path, endpoint=_ep, view_func=_make_mobile_view(_tpl, _title))


# ─── Blueprint: API ───────────────────────────────────────────────────────────

api_bp = Blueprint('api', __name__, url_prefix='/api')

@api_bp.route('/partner/match', methods=['POST'])
def match_partner_by_biz_number():
    """사업자등록번호로 파트너 매칭 (미로그인 허용 — 회원가입용)"""
    err = _require_json()
    if err: return err
    payload = request.get_json(silent=True) or {}
    biz = str(payload.get('business_number') or '').replace('-', '').strip()
    if not biz:
        return jsonify({'ok': True, 'partner': None})
    try:
        import urllib.request, json
        fb_url = f'https://freepasserp3-default-rtdb.asia-southeast1.firebasedatabase.app/partners.json'
        req_obj = urllib.request.Request(fb_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req_obj, timeout=10) as resp:
            data = json.loads(resp.read().decode('utf-8')) or {}
        for code, p in data.items():
            if not p or p.get('status') == 'deleted':
                continue
            pb = str(p.get('business_number') or '').replace('-', '').strip()
            if pb == biz:
                return jsonify({'ok': True, 'partner': {
                    'partner_code': p.get('partner_code', code),
                    'partner_name': p.get('partner_name', ''),
                    'partner_type': p.get('partner_type', ''),
                }})
        return jsonify({'ok': True, 'partner': None})
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)}), 500

@api_bp.route('/vehicle-master/fetch', methods=['POST'])
def fetch_vehicle_master_source():
    err = _require_json()
    if err: return err
    payload = request.get_json(silent=True) or {}
    source_url = str(payload.get('source_url') or '').strip()
    if not source_url:
        return _api_error('source_url이 필요합니다.')
    try:
        csv_url = _build_google_sheet_csv_url(source_url)
        csv_text = _download_text(csv_url)
        return jsonify({'ok': True, 'source_url': source_url, 'csv_url': csv_url, 'text': csv_text})
    except ValueError as error:
        return _api_error(str(error))
    except HTTPError as error:
        if error.code in (401, 403):
            message = '링크 공개 범위를 확인하세요. 링크가 있는 사용자에게 공개된 구글시트여야 합니다.'
        elif error.code == 404:
            message = '차종 마스터 링크를 찾을 수 없습니다.'
        else:
            message = f'차종 마스터 링크를 읽지 못했습니다. (HTTP {error.code})'
        return _api_error(message)
    except URLError:
        return _api_error('차종 마스터 링크에 접속할 수 없습니다.')
    except Exception as error:
        return _api_error(str(error) or '차종 마스터 링크 처리 중 오류가 발생했습니다.', 500)


@api_bp.route('/proxy-image', methods=['GET'])
def proxy_image():
    url = request.args.get('url', '').strip()
    if not url:
        return _api_error('url 파라미터가 필요합니다.')
    parsed = urlparse(url)
    allowed = ('drive.google.com', 'docs.google.com', 'lh3.googleusercontent.com', 'lh4.googleusercontent.com', 'lh5.googleusercontent.com', 'lh6.googleusercontent.com')
    if parsed.hostname not in allowed:
        return _api_error('허용되지 않는 도메인입니다.')
    if 'drive.google.com' in url and '/file/d/' in url:
        import re as _re
        m = _re.search(r'/file/d/([^/]+)', url)
        if m:
            url = f'https://drive.google.com/uc?export=download&id={m.group(1)}'
    try:
        req = Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urlopen(req, timeout=15) as resp:
            data = resp.read(MAX_DOWNLOAD_BYTES)
            ct = resp.headers.get('Content-Type', 'image/jpeg')
            return app.response_class(data, mimetype=ct, headers={'Cache-Control': 'public, max-age=86400'})
    except HTTPError as e:
        return _api_error(f'이미지를 가져올 수 없습니다. (HTTP {e.code})')
    except Exception:
        return _api_error('이미지 다운로드에 실패했습니다.')


@api_bp.route('/integrity/storage-orphans', methods=['POST'])
def check_storage_orphans():
    """
    RTDB에서 참조하는 이미지 URL 목록과 실제 Storage URL 목록을 대조하여
    고아 파일(참조가 끊긴 파일)을 찾는다.
    클라이언트가 두 목록을 body로 전달하면 diff를 계산하여 반환한다.
    (Thin Server이므로 Firebase Admin SDK 없이 클라이언트에서 데이터를 수집하여 전달)
    """
    err = _require_json()
    if err: return err
    payload = request.get_json(silent=True) or {}
    db_urls = set(str(u).strip() for u in (payload.get('db_urls') or []) if str(u).strip())
    storage_urls = set(str(u).strip() for u in (payload.get('storage_urls') or []) if str(u).strip())

    if not storage_urls:
        return _api_error('storage_urls 목록이 필요합니다.')

    orphaned = sorted(storage_urls - db_urls)
    missing = sorted(db_urls - storage_urls)

    return jsonify({
        'ok': True,
        'db_url_count': len(db_urls),
        'storage_url_count': len(storage_urls),
        'orphaned_urls': orphaned,
        'orphaned_count': len(orphaned),
        'missing_urls': missing,
        'missing_count': len(missing)
    })


@api_bp.route('/photos/zip', methods=['POST'])
def download_photos_zip():
    err = _require_json()
    if err: return err
    payload = request.get_json(silent=True) or {}
    urls = [str(u).strip() for u in (payload.get('urls') or []) if str(u).strip()]
    car_no = re.sub(r'[^\w가-힣\-]', '_', str(payload.get('car_no') or 'photos').strip()) or 'photos'

    if not urls:
        return jsonify({'ok': False, 'message': 'urls가 필요합니다.'}), 400

    # SSRF 방지: Firebase Storage URL만 허용
    _ALLOWED_HOSTS = ('firebasestorage.googleapis.com', 'storage.googleapis.com')
    urls = [u for u in urls if urlparse(u).hostname in _ALLOWED_HOSTS]
    if not urls:
        return jsonify({'ok': False, 'message': '허용되지 않은 URL입니다.'}), 400

    urls = urls[:30]
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        for i, url in enumerate(urls):
            try:
                req = Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                with urlopen(req, timeout=15) as resp:
                    data = resp.read()
                    ct = resp.headers.get('Content-Type', '')
                    ext = '.png' if 'png' in ct else '.webp' if 'webp' in ct else '.jpg'
                    zf.writestr(f'photo_{str(i + 1).zfill(2)}{ext}', data)
            except Exception:
                pass

    buf.seek(0)
    return send_file(buf, mimetype='application/zip', as_attachment=True,
                     download_name=f'{car_no}_사진.zip')


# ─── 에러 핸들러 ─────────────────────────────────────────────────────────────

@app.errorhandler(404)
def not_found(e):
    # API 요청이면 JSON, 그 외에는 홈으로 리다이렉트
    if request.path.startswith('/api/'):
        return jsonify({'ok': False, 'message': '요청한 API를 찾을 수 없습니다.'}), 404
    return redirect(url_for('auth.login'))

@app.errorhandler(500)
def internal_error(e):
    if request.path.startswith('/api/'):
        return jsonify({'ok': False, 'message': '서버 내부 오류가 발생했습니다.'}), 500
    return redirect(url_for('auth.login'))


# ─── Blueprint 등록 및 루트 리다이렉트 ───────────────────────────────────────

app.register_blueprint(auth_bp)
app.register_blueprint(pages_bp)
app.register_blueprint(mobile_bp)
app.register_blueprint(api_bp)

@app.route('/')
def index():
    if _is_mobile():
        return redirect('/m/product-list')
    return redirect('/product-list')



if __name__ == '__main__':
    app.run(debug=os.environ.get('FLASK_DEBUG', '1') == '1', port=int(os.environ.get('PORT', 7000)))
