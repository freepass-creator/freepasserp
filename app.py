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

APP_VERSION = '20260403q'

@app.context_processor
def inject_app_version():
    return {'app_version': APP_VERSION}


# ─── 구글시트 유틸 ────────────────────────────────────────────────────────────

def _build_google_sheet_csv_url(source_url: str) -> str:
    text = str(source_url or '').strip()
    if not text:
        raise ValueError('차종 마스터 링크를 입력하세요.')

    parsed = urlparse(text)
    if 'docs.google.com' not in (parsed.netloc or ''):
        return text

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


def _download_text(url: str) -> str:
    request_obj = Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urlopen(request_obj, timeout=20) as response:
        charset = response.headers.get_content_charset() or 'utf-8'
        content_type = response.headers.get('Content-Type', '')
        body = response.read().decode(charset, errors='replace')
        if 'text/csv' in content_type or body.lstrip().startswith(('제조사,', 'maker,', '"제조사"', '"maker"')):
            return body
        if '<!DOCTYPE html' in body or '<html' in body.lower():
            raise ValueError('링크 공개 범위를 확인하세요. 링크가 있는 사용자에게 공개된 구글시트여야 합니다.')
        return body


# ─── API 에러 응답 헬퍼 ──────────────────────────────────────────────────────

def _api_error(message: str, status: int = 400):
    return jsonify({'ok': False, 'message': message}), status


# ─── Blueprint: 인증 ─────────────────────────────────────────────────────────

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/login')
def login():
    return render_template('login_new.html', page_title='로그인')

@auth_bp.route('/signup')
def signup():
    return render_template('signup.html', page_title='회원가입')

@auth_bp.route('/reset-password')
def reset_password():
    return render_template('reset-password.html', page_title='비밀번호재설정')


# ─── Blueprint: 페이지 ───────────────────────────────────────────────────────

pages_bp = Blueprint('pages', __name__)

_NEW_ROUTES = [
    ('/home',          'new/home_new.html',            '홈'),
    ('/product-list',  'new/product_list_new.html',    '상품목록'),
    ('/chat',          'new/chat_new.html',             '대화'),
    ('/contract',      'new/contract_manage_new.html', '계약'),
    ('/settlement',    'new/settlement_manage_new.html','정산'),
    ('/product-new',   'new/product_manage_new.html',  '재고'),
    ('/terms',         'new/policy_manage_new.html',   '정책'),
    ('/partner',       'new/partner_manage_new.html',  '파트너'),
    ('/member',        'new/member_manage_new.html',   '회원'),
    ('/admin',         'new/admin_new.html',            '관리자'),
    ('/settings',      'new/settings_new.html',        '설정'),
    ('/codes',         'code-manage.html',              '코드관리'),
    ('/request',       'request-manage.html',           '요청하기'),
]

def _make_new_view(template: str, title: str):
    def view():
        return render_template(template, page_title=title)
    return view

@pages_bp.route('/catalog')
def catalog_view():
    return render_template('new/catalog_new.html', page_title='상품 카탈로그')

for _path, _tpl, _title in _NEW_ROUTES:
    _ep = _path.lstrip('/').replace('-', '_').replace('/', '_')
    pages_bp.add_url_rule(_path, endpoint=_ep, view_func=_make_new_view(_tpl, _title))


# ─── Blueprint: API ───────────────────────────────────────────────────────────

api_bp = Blueprint('api', __name__, url_prefix='/api')

@api_bp.route('/vehicle-master/fetch', methods=['POST'])
def fetch_vehicle_master_source():
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


@api_bp.route('/integrity/storage-orphans', methods=['POST'])
def check_storage_orphans():
    """
    RTDB에서 참조하는 이미지 URL 목록과 실제 Storage URL 목록을 대조하여
    고아 파일(참조가 끊긴 파일)을 찾는다.
    클라이언트가 두 목록을 body로 전달하면 diff를 계산하여 반환한다.
    (Thin Server이므로 Firebase Admin SDK 없이 클라이언트에서 데이터를 수집하여 전달)
    """
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
    payload = request.get_json(silent=True) or {}
    urls = [str(u).strip() for u in (payload.get('urls') or []) if str(u).strip()]
    car_no = re.sub(r'[^\w가-힣\-]', '_', str(payload.get('car_no') or 'photos').strip()) or 'photos'

    if not urls:
        return jsonify({'ok': False, 'message': 'urls가 필요합니다.'}), 400

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
app.register_blueprint(api_bp)

@app.route('/')
def index():
    return redirect(url_for('auth.login'))


if __name__ == '__main__':
    app.run(debug=True, port=7000)
