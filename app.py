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
    ('/download-center', 'pages/download-center.html',  '다운로드센터'),
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


DRIVE_API_KEY = 'AIzaSyBSPo1kZOefX-6NuHoQdUF1htqQDSxXsCs'
_drive_folder_cache = {}  # folder_id → (ts, urls)
_DRIVE_CACHE_TTL = 3600  # 1시간


def _extract_drive_folder_id(value: str) -> str:
    if not value:
        return ''
    s = str(value).strip()
    m = re.search(r'/folders/([a-zA-Z0-9_-]+)', s)
    if m:
        return m.group(1)
    m = re.search(r'/drive/.*?/([a-zA-Z0-9_-]{20,})', s)
    if m:
        return m.group(1)
    if re.match(r'^[a-zA-Z0-9_-]{20,}$', s):
        return s
    return ''


@api_bp.route('/drive-folder-images', methods=['GET'])
def drive_folder_images():
    """Google Drive 공개 폴더의 이미지 파일 목록 반환.
    썸네일 URL(lh3.googleusercontent.com) 형태로 돌려주므로 <img> 태그에 바로 사용 가능.
    size 파라미터(픽셀, w{size})로 해상도 선택 — 카드는 600, 상세는 1920 권장.
    폴더가 '링크 있는 누구나 보기'로 공개돼 있어야 함.
    """
    import json as _json
    folder_input = request.args.get('folder', '').strip()
    try:
        size = int(request.args.get('size', 1920))
    except ValueError:
        size = 1920
    size = max(200, min(4000, size))
    folder_id = _extract_drive_folder_id(folder_input)
    if not folder_id:
        return _api_error('유효한 폴더 URL/ID가 아닙니다.')

    now = time.time()
    # 캐시는 file_id 목록만 저장 → 요청 size 에 따라 URL 동적 생성
    cached = _drive_folder_cache.get(folder_id)
    if cached and now - cached[0] < _DRIVE_CACHE_TTL:
        ids = cached[1]
        urls = [f'https://lh3.googleusercontent.com/d/{fid}=w{size}' for fid in ids]
        return jsonify({'ok': True, 'urls': urls, 'count': len(urls), 'cached': True})

    try:
        query = f"'{folder_id}' in parents and mimeType contains 'image/' and trashed = false"
        api_url = (
            'https://www.googleapis.com/drive/v3/files'
            f'?q={quote(query)}&key={DRIVE_API_KEY}'
            '&fields=files(id,name,mimeType)&pageSize=200&orderBy=name'
        )
        req = Request(api_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urlopen(req, timeout=20) as resp:
            data = _json.loads(resp.read().decode('utf-8'))
        files = data.get('files', [])
        ids = [f['id'] for f in files if f.get('id')]
        urls = [f'https://lh3.googleusercontent.com/d/{fid}=w{size}' for fid in ids]
        _drive_folder_cache[folder_id] = (now, ids)
        # 캐시 용량 제한 (500건 초과 시 오래된 100건 제거)
        if len(_drive_folder_cache) > 500:
            oldest = sorted(_drive_folder_cache.items(), key=lambda kv: kv[1][0])[:100]
            for k, _ in oldest:
                _drive_folder_cache.pop(k, None)
        return jsonify({'ok': True, 'urls': urls, 'count': len(urls)})
    except HTTPError as e:
        msg = f'Drive API HTTP {e.code}'
        if e.code == 403:
            msg += ' — Drive API 미활성 또는 폴더 비공개'
        return _api_error(msg, 502)
    except Exception as e:
        return _api_error(f'폴더 조회 실패: {e}', 502)


_scrape_cache = {}  # url → (ts, urls)


def _scrape_page_images(url: str) -> list:
    """외부 HTML 페이지에서 차량 이미지 추출 (사이트별 휴리스틱).
    현재 지원: moderentcar.co.kr (moren-images S3 버킷).
    확장 가능 — 다른 도메인 추가 시 여기에 분기 추가.
    """
    parsed = urlparse(url)
    host = (parsed.hostname or '').lower()

    req = Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
    })
    with urlopen(req, timeout=20) as resp:
        html_bytes = resp.read(8 * 1024 * 1024)
    html = html_bytes.decode('utf-8', errors='replace')

    urls = []
    seen = set()

    def add(u: str):
        u = u.strip()
        if not u or u in seen:
            return
        seen.add(u)
        urls.append(u)

    if 'moderentcar.co.kr' in host:
        # moren-images S3 원본만 (썸네일/thumb 제외)
        pattern = r'["\'](https?://moren-images\.s3[^"\'\s]+?\.(?:jpg|jpeg|png|webp))["\']'
        for m in re.finditer(pattern, html, re.IGNORECASE):
            u = m.group(1)
            if '/thumb/' in u:
                continue
            # 로고/아이콘 제외 — 차량 업로드 경로만
            if '/data/files/' not in u:
                continue
            add(u)
    else:
        # 범용 휴리스틱 — 큰 이미지만 (data-src 우선, 로고/아이콘 제외)
        for attr in ('data-src', 'data-original', 'data-lazy', 'src'):
            pattern = rf'{attr}=["\'](https?://[^"\'\s]+?\.(?:jpg|jpeg|png|webp))["\']'
            for m in re.finditer(pattern, html, re.IGNORECASE):
                u = m.group(1)
                low = u.lower()
                if any(x in low for x in ('logo', 'icon', 'favicon', 'sprite', 'banner', 'btn_', '/adm/', '/assets/ico')):
                    continue
                add(u)

    return urls


@api_bp.route('/extract-photos', methods=['GET'])
def extract_photos():
    """URL 종류에 따라 사진 URL 목록 반환.
    - drive.google.com 폴더 → Drive API
    - 일반 페이지 → HTML 스크래핑
    """
    url = request.args.get('url', '').strip()
    if not url:
        return _api_error('url 파라미터가 필요합니다.')
    try:
        size = int(request.args.get('size', 1920))
    except ValueError:
        size = 1920
    size = max(200, min(4000, size))

    # Drive 폴더면 기존 Drive API 로 위임
    folder_id = _extract_drive_folder_id(url)
    if folder_id and 'drive.google.com' in url:
        # 내부 재사용 — drive_folder_images 로직 직접 호출하지 않고 복제
        import json as _json
        now = time.time()
        cached = _drive_folder_cache.get(folder_id)
        if cached and now - cached[0] < _DRIVE_CACHE_TTL:
            ids = cached[1]
            urls = [f'https://lh3.googleusercontent.com/d/{fid}=w{size}' for fid in ids]
            return jsonify({'ok': True, 'urls': urls, 'count': len(urls), 'source': 'drive', 'cached': True})
        try:
            query = f"'{folder_id}' in parents and mimeType contains 'image/' and trashed = false"
            api_url = (
                'https://www.googleapis.com/drive/v3/files'
                f'?q={quote(query)}&key={DRIVE_API_KEY}'
                '&fields=files(id,name,mimeType)&pageSize=200&orderBy=name'
            )
            req = Request(api_url, headers={'User-Agent': 'Mozilla/5.0'})
            with urlopen(req, timeout=20) as resp:
                data = _json.loads(resp.read().decode('utf-8'))
            files = data.get('files', [])
            ids = [f['id'] for f in files if f.get('id')]
            _drive_folder_cache[folder_id] = (now, ids)
            urls = [f'https://lh3.googleusercontent.com/d/{fid}=w{size}' for fid in ids]
            return jsonify({'ok': True, 'urls': urls, 'count': len(urls), 'source': 'drive'})
        except HTTPError as e:
            msg = f'Drive API HTTP {e.code}'
            if e.code == 403:
                msg += ' — Drive API 미활성 또는 폴더 비공개'
            return _api_error(msg, 502)
        except Exception as e:
            return _api_error(f'폴더 조회 실패: {e}', 502)

    # 일반 페이지 — HTML 스크래핑
    parsed = urlparse(url)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname:
        return _api_error('올바른 URL이 아닙니다.')

    now = time.time()
    cached = _scrape_cache.get(url)
    if cached and now - cached[0] < _DRIVE_CACHE_TTL:
        return jsonify({'ok': True, 'urls': cached[1], 'count': len(cached[1]), 'source': 'scrape', 'cached': True})

    try:
        urls = _scrape_page_images(url)
        if urls:
            _scrape_cache[url] = (now, urls)
            if len(_scrape_cache) > 500:
                oldest = sorted(_scrape_cache.items(), key=lambda kv: kv[1][0])[:100]
                for k, _ in oldest:
                    _scrape_cache.pop(k, None)
        return jsonify({'ok': True, 'urls': urls, 'count': len(urls), 'source': 'scrape'})
    except HTTPError as e:
        return _api_error(f'페이지 로드 실패 HTTP {e.code}', 502)
    except Exception as e:
        return _api_error(f'스크래핑 실패: {e}', 502)


@api_bp.route('/fetch-remote-image', methods=['POST'])
def fetch_remote_image():
    """임의의 외부 이미지 URL을 서버가 다운로드해서 바이트로 반환.
    외부 링크 이미지를 Firebase Storage로 일괄 이관하는 배치 도구용.
    CORS/Referer 회피, MIME·크기 검증 포함.
    """
    err = _require_json()
    if err: return err
    payload = request.get_json(silent=True) or {}
    url = str(payload.get('url', '')).strip()
    if not url:
        return _api_error('url 파라미터가 필요합니다.')
    parsed = urlparse(url)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname:
        return _api_error('올바른 URL이 아닙니다.')
    # Google Drive 공유 링크 → 직접 다운로드 URL로 변환
    if 'drive.google.com' in url and '/file/d/' in url:
        m = re.search(r'/file/d/([^/]+)', url)
        if m:
            url = f'https://drive.google.com/uc?export=download&id={m.group(1)}'
    try:
        req = Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': f'{parsed.scheme}://{parsed.hostname}/'
        })
        with urlopen(req, timeout=30) as resp:
            ct = (resp.headers.get('Content-Type', 'image/jpeg') or '').split(';')[0].strip().lower()
            if ct and not ct.startswith('image/') and ct != 'application/octet-stream':
                return _api_error(f'이미지가 아닙니다. (Content-Type: {ct})', 415)
            data = resp.read(MAX_DOWNLOAD_BYTES + 1)
            if len(data) > MAX_DOWNLOAD_BYTES:
                return _api_error('파일이 너무 큽니다 (최대 10MB).', 413)
            return app.response_class(data, mimetype=ct or 'image/jpeg')
    except HTTPError as e:
        return _api_error(f'HTTP {e.code}: 원본을 가져올 수 없습니다.', 502)
    except Exception as e:
        return _api_error(f'다운로드 실패: {e}', 502)


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


@api_bp.route('/sync/external-sheet', methods=['POST'])
def sync_external_sheet():
    """외부 구글시트 → JSON 파싱 (클라이언트가 Firebase에 저장)"""
    import json, urllib.request, hashlib, re
    from datetime import datetime

    SHEETS_API_KEY = 'AIzaSyBSPo1kZOefX-6NuHoQdUF1htqQDSxXsCs'
    SHEET_ID = '1TJBG4PABgly7EtGG6Os5GcY9La7kDR_yex56KHhXe2U'
    TAB_NAME = '판매차량리스트(수수료100)'
    PROVIDER_CODE = 'RP023'

    try:
        encoded_tab = quote(TAB_NAME)
        # 1a-1. 차량번호 셀의 스마트칩 링크 읽기 (chipRuns → 구글드라이브 폴더)
        photo_link_map = {}  # row_idx → drive folder url
        try:
            chip_url = f'https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}?ranges={encoded_tab}&fields=sheets.data.rowData.values.chipRuns&key={SHEETS_API_KEY}'
            chip_req = urllib.request.Request(chip_url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(chip_req, timeout=30) as resp:
                chip_data = json.loads(resp.read().decode('utf-8'))
            chip_sheets = chip_data.get('sheets', [])
            if chip_sheets:
                chip_rows = chip_sheets[0].get('data', [{}])[0].get('rowData', [])
                for ri, rd in enumerate(chip_rows):
                    for cell in (rd.get('values') or []):
                        for chip_run in (cell.get('chipRuns') or []):
                            uri = chip_run.get('chip', {}).get('richLinkProperties', {}).get('uri', '')
                            if uri and 'drive.google.com' in uri:
                                photo_link_map[ri] = uri.split('?')[0]  # query param 제거
                                break
                        if ri in photo_link_map: break
        except Exception:
            pass

        # 1a-2. 셀 값 읽기
        sheets_url = f'https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}/values/{encoded_tab}?key={SHEETS_API_KEY}'
        req_obj = urllib.request.Request(sheets_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req_obj, timeout=30) as resp:
            sheet_data = json.loads(resp.read().decode('utf-8'))

        rows = sheet_data.get('values', [])
        if not rows:
            return jsonify({'ok': False, 'message': '시트 데이터 없음'}), 400


        # 헤더 찾기
        header_idx = None
        headers = []
        for i, row in enumerate(rows):
            row_str = [str(c).strip() for c in row]
            if '차량번호' in row_str:
                header_idx = i
                headers = row_str
                break
        if header_idx is None:
            return jsonify({'ok': False, 'message': '헤더 행을 찾을 수 없음'}), 400

        def col_idx(name):
            try: return headers.index(name)
            except ValueError: return -1

        idx_car = col_idx('차량번호')
        idx_model_short = col_idx('차종') if '차종' in headers else col_idx('모델명')
        idx_model_full = -1
        for i, h in enumerate(headers):
            if i != idx_model_short and i > idx_model_short and ('모델' in h or '차명' in h or '세부' in h):
                idx_model_full = i; break
        # 차종 바로 옆이 풀네임인 패턴
        if idx_model_full == -1 and idx_model_short >= 0 and idx_model_short + 1 < len(headers):
            next_h = headers[idx_model_short + 1]
            if next_h and next_h not in ('색상', '연료', '주행거리(예상)'):
                idx_model_full = idx_model_short + 1

        def col_partial(keyword):
            for ci, h in enumerate(headers):
                if keyword in h: return ci
            return -1

        idx_color = col_partial('색상')
        idx_fuel = col_partial('연료')
        idx_mileage = col_partial('주행')
        idx_reg_date = col_partial('최초등록')
        idx_location = col_partial('현위치')
        idx_status = col_partial('판매상태')
        idx_options = col_partial('옵션')
        idx_notes = col_partial('비고')

        # 가격 컬럼 (3만km 기준: 12/24/36)
        idx_rent_12 = idx_rent_24 = idx_rent_36 = -1
        for i, h in enumerate(headers):
            hl = h.replace(' ', '')
            if '12개월' in hl and '3만' in hl: idx_rent_12 = i
            elif '24개월' in hl and '3만' in hl: idx_rent_24 = i
            elif '36개월' in hl and '3만' in hl: idx_rent_36 = i
        # 12개월은 3만km만 존재하는 경우 (헤더에 "3만" 없이 "12개월"만)
        if idx_rent_12 == -1:
            for i, h in enumerate(headers):
                if '12개월' in h.replace(' ', ''): idx_rent_12 = i; break

        def safe_get(row, idx):
            if idx < 0 or idx >= len(row): return ''
            return str(row[idx]).strip()

        def parse_price(val):
            return int(re.sub(r'[^\d]', '', val) or '0')

        # ── 차종 → 제조사 매핑 ──
        MAKER_MAP = {
            # 현대
            '그랜저': '현대', '쏘나타': '현대', '아반떼': '현대', '투싼': '현대', '싼타페': '현대',
            '팰리세이드': '현대', '코나': '현대', '베뉴': '현대', '캐스퍼': '현대', '스타리아': '현대',
            '아이오닉': '현대', '아이오닉5': '현대', '아이오닉6': '현대', '넥쏘': '현대', '포터': '현대',
            '엑센트': '현대', '벨로스터': '현대', 'i30': '현대', 'i40': '현대',
            # 기아
            'K9': '기아', 'K8': '기아', 'K7': '기아', 'K5': '기아', 'K3': '기아',
            '쏘렌토': '기아', '카니발': '기아', '스포티지': '기아', '셀토스': '기아', '니로': '기아',
            'EV6': '기아', 'EV9': '기아', '모하비': '기아', '레이': '기아', '봉고': '기아',
            '스팅어': '기아', '모닝': '기아',
            # 제네시스
            'G90': '제네시스', 'G80': '제네시스', 'G70': '제네시스',
            'GV90': '제네시스', 'GV80': '제네시스', 'GV70': '제네시스', 'GV60': '제네시스',
            # 쉐보레
            '말리부': '쉐보레', '트래버스': '쉐보레', '트랙스': '쉐보레', '이쿼녹스': '쉐보레',
            '콜로라도': '쉐보레', '볼트': '쉐보레', '타호': '쉐보레',
            # 르노
            'SM6': '르노', 'QM6': '르노', 'XM3': '르노', '아르카나': '르노', '마스터': '르노',
            # KG/쌍용
            '토레스': 'KG모빌리티', '렉스턴': 'KG모빌리티', '티볼리': 'KG모빌리티', '코란도': 'KG모빌리티',
            # 수입
            'BMW': 'BMW', '벤츠': 'Mercedes-Benz', '아우디': 'Audi', '볼보': 'Volvo',
            '렉서스': 'Lexus', '포르쉐': 'Porsche', '미니': 'MINI', '폭스바겐': 'Volkswagen',
            '테슬라': 'Tesla', '링컨': 'Lincoln', '재규어': 'Jaguar', '랜드로버': 'Land Rover',
            '마세라티': 'Maserati', '벤틀리': 'Bentley', '롤스로이스': 'Rolls-Royce',
            '페라리': 'Ferrari', '람보르기니': 'Lamborghini', '푸조': 'Peugeot',
        }
        # BMW 740d 같은 수입차: 차종에 브랜드명이 포함된 경우
        IMPORT_BRAND_KEYWORDS = ['bmw', 'benz', 'mercedes', '벤츠', 'audi', '아우디', 'volvo', '볼보',
                       'lexus', '렉서스', 'porsche', '포르쉐', 'jaguar', '재규어', 'land rover',
                       '랜드로버', 'mini', '미니', 'volkswagen', '폭스바겐', 'peugeot', '푸조',
                       'maserati', '마세라티', 'bentley', '벤틀리', 'rolls', '롤스', 'ferrari',
                       '페라리', 'lamborghini', '람보르기니', 'tesla', '테슬라', 'lincoln', '링컨']
        def is_import(name):
            nl = name.lower()
            return any(b in nl for b in IMPORT_BRAND_KEYWORDS)

        def resolve_maker(short_name):
            """차종(간략명)에서 제조사 추출"""
            if short_name in MAKER_MAP:
                return MAKER_MAP[short_name]
            # 수입차: "BMW 740d" → "BMW"
            for brand, maker in MAKER_MAP.items():
                if short_name.startswith(brand + ' ') or short_name.startswith(brand):
                    return maker
            # 풀네임에서 키워드 검색
            for brand, maker in MAKER_MAP.items():
                if brand in short_name:
                    return maker
            return ''

        # parse_vehicle_name은 클라이언트에서 차량마스터 기반으로 처리

        # ── 상태 매핑 ──
        STATUS_MAP = {
            '판매중': 'available', '할인판매': 'available',
            '계약중': 'unavailable', '계약요청': 'unavailable',
            '보류': 'unavailable', '매각진행중': 'unavailable', '판매완료': 'unavailable',
            '판매보류': 'unavailable', '수리중': 'unavailable',
        }
        VEHICLE_STATUS_MAP = {
            '판매중': '출고가능', '할인판매': '출고가능',
            '계약중': '계약완료', '계약요청': '계약대기',
            '보류': '출고불가', '매각진행중': '출고불가', '판매완료': '출고불가',
            '판매보류': '출고불가', '수리중': '출고불가',
        }

        products = {}
        now_ms = int(datetime.now().timestamp() * 1000)
        synced = skipped = 0

        for row_offset, row in enumerate(rows[header_idx + 1:]):
            abs_row_idx = header_idx + 1 + row_offset
            car_number = safe_get(row, idx_car)
            if not car_number or not re.search(r'[가-힣]', car_number):
                skipped += 1; continue

            status_raw = safe_get(row, idx_status)
            status = STATUS_MAP.get(status_raw, '')
            if not status:
                skipped += 1; continue
            vehicle_status = VEHICLE_STATUS_MAP.get(status_raw, '출고가능')

            model_short = safe_get(row, idx_model_short)
            model_full = safe_get(row, idx_model_full) if idx_model_full >= 0 else ''

            rent_12 = parse_price(safe_get(row, idx_rent_12)) if idx_rent_12 >= 0 else 0
            rent_24 = parse_price(safe_get(row, idx_rent_24)) if idx_rent_24 >= 0 else 0
            rent_36 = parse_price(safe_get(row, idx_rent_36)) if idx_rent_36 >= 0 else 0

            imp = is_import(model_full) or is_import(model_short)
            dep_mult = 3 if imp else 2

            uid_seed = f'{PROVIDER_CODE}_{car_number}'
            product_uid = f'EXT_{hashlib.md5(uid_seed.encode()).hexdigest()[:12]}'

            mileage = int(re.sub(r'[^\d]', '', safe_get(row, idx_mileage)) or '0')

            # 연식 계산 (최초등록일 → 연식)
            reg_date = safe_get(row, idx_reg_date)
            year_model = ''
            if reg_date:
                y_match = re.match(r'(\d{4})', reg_date)
                if y_match:
                    y = int(y_match.group(1))
                    year_model = f'{str(y)[2:]}년식'

            product = {
                'product_uid': product_uid,
                'product_code': f'{PROVIDER_CODE}_{car_number}',
                'provider_company_code': PROVIDER_CODE,
                'car_number': car_number,
                'raw_model_short': model_short,
                'raw_model_full': model_full,
                'maker': '',
                'model_name': '',
                'sub_model': '',
                'trim_name': '',
                'ext_color': safe_get(row, idx_color),
                'fuel_type': safe_get(row, idx_fuel),
                'mileage': mileage,
                'year': year_model,
                'first_registration_date': reg_date,
                'location': safe_get(row, idx_location),
                'status': status,
                'vehicle_status': vehicle_status,
                'product_type': '중고구독',
                'status_label': status_raw,
                'options': safe_get(row, idx_options) if idx_options >= 0 else '',
                'partner_memo': safe_get(row, idx_notes) if idx_notes >= 0 else '',
                'photo_link': photo_link_map.get(abs_row_idx, ''),
                'source': 'external_sheet',
                'source_sheet_id': SHEET_ID,
                'price': {},
                'created_at': now_ms,
                'updated_at': now_ms,
            }
            if rent_12: product['price']['12'] = {'rent': rent_12, 'deposit': rent_12 * dep_mult}
            if rent_24: product['price']['24'] = {'rent': rent_24, 'deposit': rent_24 * dep_mult}
            if rent_36: product['price']['36'] = {'rent': rent_36, 'deposit': rent_36 * dep_mult}

            products[product_uid] = product
            synced += 1

        return jsonify({'ok': True, 'synced': synced, 'skipped': skipped, 'products': products})

    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)}), 500


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


# ─── Solapi 문자 발송 ───────────────────────────────────────────────────────
import hmac, hashlib, secrets, datetime, json as _json
SOLAPI_API_KEY = os.environ.get('SOLAPI_API_KEY', 'NCSV5JTOZ121DIDR')
SOLAPI_API_SECRET = os.environ.get('SOLAPI_API_SECRET', 'EHWRARRBCD9UYQ3HFBM8XINKZD8BHNE0')
SOLAPI_FROM = os.environ.get('SOLAPI_FROM', '01063930926')  # 사전 등록된 발신번호 (Solapi 콘솔에서 등록)

def _solapi_auth_header():
    # HMAC-SHA256(date + salt, secret)
    date = datetime.datetime.utcnow().isoformat(timespec='milliseconds') + 'Z'
    salt = secrets.token_hex(16)
    msg = (date + salt).encode('utf-8')
    sig = hmac.new(SOLAPI_API_SECRET.encode('utf-8'), msg, hashlib.sha256).hexdigest()
    return f'HMAC-SHA256 apiKey={SOLAPI_API_KEY}, date={date}, salt={salt}, signature={sig}'

SMS_API_ADMIN_KEY = os.environ.get('SMS_API_ADMIN_KEY', '')  # 서버 시작 시 설정 — 없으면 엔드포인트 비활성

@app.route('/api/sms/send', methods=['POST'])
def api_sms_send():
    """Solapi 단건 SMS 발송 (관리자 키 필수). body: {to, text, from?}"""
    # 관리자 키 미설정 시 엔드포인트 차단 (실수로 노출 방지)
    if not SMS_API_ADMIN_KEY:
        return jsonify({'ok': False, 'error': 'SMS endpoint disabled (SMS_API_ADMIN_KEY 미설정)'}), 503
    # 헤더 검증
    if request.headers.get('X-Admin-Key', '') != SMS_API_ADMIN_KEY:
        return jsonify({'ok': False, 'error': 'unauthorized'}), 401
    try:
        body = request.get_json(silent=True) or {}
        to = str(body.get('to', '')).replace('-', '').strip()
        text = str(body.get('text', '')).strip()
        sender = str(body.get('from', '') or SOLAPI_FROM).replace('-', '').strip()
        if not to or not text:
            return jsonify({'ok': False, 'error': 'to/text 필수'}), 400
        if not sender:
            return jsonify({'ok': False, 'error': '발신번호 미설정 (SOLAPI_FROM 환경변수 또는 body.from 필요)'}), 400

        payload = _json.dumps({'message': {'to': to, 'from': sender, 'text': text}}).encode('utf-8')
        req = Request(
            'https://api.solapi.com/messages/v4/send',
            data=payload,
            method='POST',
            headers={
                'Authorization': _solapi_auth_header(),
                'Content-Type': 'application/json; charset=utf-8',
            },
        )
        with urlopen(req, timeout=10) as res:
            result = _json.loads(res.read().decode('utf-8'))
        return jsonify({'ok': True, 'result': result})
    except HTTPError as e:
        try:
            err_body = e.read().decode('utf-8')
        except Exception:
            err_body = str(e)
        return jsonify({'ok': False, 'error': f'HTTP {e.code}', 'detail': err_body}), 500
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500


if __name__ == '__main__':
    app.run(debug=os.environ.get('FLASK_DEBUG', '1') == '1', port=int(os.environ.get('PORT', 7000)))
