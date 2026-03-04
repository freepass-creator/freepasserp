from __future__ import annotations

import csv
import io
import json
import os
import re
import time
import urllib.parse
import urllib.request
from datetime import datetime
from typing import Any, Dict, List

import jwt
from jwt import PyJWKClient
import requests

from flask import Flask, jsonify, render_template, redirect, request, url_for, session, abort
from werkzeug.utils import secure_filename

app = Flask(__name__, template_folder="templates", static_folder="static")
app.secret_key = os.environ.get('FREEPASS_SECRET_KEY') or 'dev-secret-change-me'


# -----------------------------
# App version (single source of truth)
# -----------------------------
VERSION_TXT = os.path.join(os.path.dirname(__file__), 'VERSION.txt')


def _read_app_version() -> str:
    try:
        with open(VERSION_TXT, 'r', encoding='utf-8') as f:
            v = (f.read() or '').strip()
        return v or '000'
    except Exception:
        return '000'


APP_VERSION = _read_app_version()


@app.context_processor
def inject_app_version():
    # Use a single injected variable to avoid duplicated/contradictory version strings
    return {'app_version': APP_VERSION}


# -----------------------------
# Local storage (safe MVP)
# -----------------------------
# NOTE (IMPORTANT):
# - Local dev: store JSON under repo's ./data directory.
# - Vercel/serverless: project filesystem is read-only. MUST write to /tmp.
#
# You can override storage location via FREEPASS_DATA_DIR.
REPO_DIR = os.path.dirname(__file__)
REPO_DATA_DIR = os.path.join(REPO_DIR, "data")

_is_vercel = bool(os.environ.get("VERCEL"))
DATA_DIR = os.environ.get("FREEPASS_DATA_DIR") or (
    os.path.join("/tmp", "freepasserp_data") if _is_vercel else REPO_DATA_DIR
)

# Upload dir: keep writable on serverless. (Serving uploaded images on Vercel is
# out-of-scope for this MVP; we still keep a writable target to avoid crashes.)
UPLOAD_VEHICLE_DIR = os.path.join(
    ("/tmp" if _is_vercel else app.static_folder), "uploads", "vehicles"
)

VEHICLES_JSON = os.path.join(DATA_DIR, "vehicles.json")
CHATROOMS_JSON = os.path.join(DATA_DIR, "chat_rooms.json")

POLICIES_JSON = os.path.join(DATA_DIR, "policies.json")
VEHICLE_MASTER_JSON = os.path.join(DATA_DIR, "vehicle_master.json")

USERS_JSON = os.path.join(DATA_DIR, "users.json")
USERS_PENDING_JSON = os.path.join(DATA_DIR, "users_pending.json")
USERS_REJECTED_JSON = os.path.join(DATA_DIR, "users_rejected.json")

# Partners (소속 파트너/회사) master (Local MVP)
PARTNERS_JSON = os.path.join(DATA_DIR, "partners.json")


def _ensure_runtime_data_dir() -> None:
    """Ensure writable runtime DATA_DIR exists."""
    os.makedirs(DATA_DIR, exist_ok=True)


def _seed_runtime_file_if_missing(filename: str) -> None:
    """Copy seed JSON from repo data dir into runtime DATA_DIR if missing."""
    _ensure_runtime_data_dir()
    dst = os.path.join(DATA_DIR, filename)
    if os.path.exists(dst):
        return
    src = os.path.join(REPO_DATA_DIR, filename)
    if os.path.exists(src):
        try:
            with open(src, "rb") as fsrc:
                raw = fsrc.read()
            with open(dst, "wb") as fdst:
                fdst.write(raw)
        except Exception:
            # If copying fails, caller will create default file later.
            pass

# -----------------------------
# Firebase Auth (ID token verification)
# -----------------------------
# NOTE: This app verifies Firebase ID tokens WITHOUT firebase-admin.
# It fetches Google's public certs at runtime and verifies JWT signature.
FIREBASE_PROJECT_ID = os.environ.get("FIREBASE_PROJECT_ID", "freepasserp")
FIREBASE_CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"
FIREBASE_JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
FIREBASE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"
_fb_certs_cache = {"ts": 0.0, "certs": {}}
_FB_CERTS_TTL_SEC = 60 * 60  # 1 hour
_fb_jwk_client: PyJWKClient | None = None

# Bootstrap admin (create this account in Firebase Auth console once)
# Firebase Auth에서 최초 관리자 계정을 부트스트랩하기 위한 이메일(기본값)
# - Firebase 콘솔에서 해당 이메일 계정을 먼저 생성해두면, 첫 로그인 시 자동으로 ADMIN/ACTIVE로 등록됩니다.
BOOTSTRAP_ADMIN_EMAIL = os.environ.get("BOOTSTRAP_ADMIN_EMAIL", "admin@freepassmobility.com").strip().lower()
BOOTSTRAP_ADMIN_CODE = os.environ.get("BOOTSTRAP_ADMIN_CODE", "A0001").strip()


def _ensure_policies_store() -> None:
    """Ensure data/policies.json exists and contains 5 fixed policy slots.

    운영 원칙:
      - 정책 ID는 고정: POL_01 ~ POL_05 (절대 변경하지 않음)
      - 사용자가 변경 가능한 건 name(표시명)과 숫자/조건 데이터
      - 차량은 policyId만 저장하며, 정책을 수정하면 같은 policyId 차량에 자동 반영됨
    """
    _ensure_runtime_data_dir()
    _seed_runtime_file_if_missing("policies.json")

    now = datetime.now()
    now_ver = now.strftime("%Y.%m.%d")
    now_date = now.strftime("%Y-%m-%d")
    now_dt = now.strftime("%Y-%m-%d %H:%M:%S")

    # 기본 템플릿(대표님 기준값)
    # - 대인: 한도 무한(고정) / 면책금 30만원
    # - 자차: 한도 차량가액(기본) 또는 금액 / 면책 수리비 20% / 최소 50만원 / 최대 100만원
    template_policy = {
        "seeded_defaults": True,
        "category": "DOMESTIC",
        "version": now_ver,
        "effective_from": now_date,
        "driver": {
            "base_min_age": 26,
            # age surcharge defaults (운영안함)
            "age_surcharge_21": {"mode": "none", "value": None},
            "age_surcharge_23": {"mode": "none", "value": None},
            "driving_exp": "any",
        },
        "mileage": {
            "contract_km_per_year": 30000,
            "plus_10k_rule": {"mode": "fixed", "value": None},
            "plus_10k_fee": None,
            "over_km_fee": 120,
        },
        "penalty": {"lt_1y_pct": 30, "gte_1y_pct": 20},
        "insurance": {
            # 대인: 한도 무한(고정) / 면책금 300,000
            "liability_bodily": {"type": "UNLIMITED", "amount": None, "deductible_amount": 300000},
            # 대물: 100,000,000 / 면책금 300,000
            "liability_property": {"type": "AMOUNT", "amount": 100000000, "deductible_amount": 300000},
            # 자손: 100,000,000 / 면책금 0
            "personal_injury": {"type": "AMOUNT", "amount": 100000000, "deductible_amount": 0},
            # 무보험차상해: 0 / 면책금 0
            "uninsured": {"type": "AMOUNT", "amount": 0, "deductible_amount": 0},
            # 자차: 한도 차량가액 / 자차수리비율 20% / 최소 500,000 / 최대 1,000,000
            "collision": {
                "limit": {"type": "UP_TO_VEHICLE_VALUE", "amount_won": None},
                "deductible": {"percent": 20, "min_won": 500000, "max_won": 1000000},
            },
        },
        "service": {"emergency_per_year": 5},
        "extras": {},
    }

    def _clone(pid: str, name: str) -> Dict[str, Any]:
        p = json.loads(json.dumps(template_policy))
        p["id"] = pid
        p["name"] = name
        p["changeLog"] = [{"at": now_dt, "action": "seed", "fields": []}]
        return p

    # if file missing -> create 5 slots
    if not os.path.exists(POLICIES_JSON):
        default = [
            _clone("POL_01", "약관샘플"),
            _clone("POL_02", ""),
            _clone("POL_03", ""),
            _clone("POL_04", ""),
            _clone("POL_05", ""),
        ]
        with open(POLICIES_JSON, "w", encoding="utf-8") as f:
            json.dump(default, f, ensure_ascii=False, indent=2)
        return

    # if file exists -> ensure slots exist + migrate legacy ids if needed
    try:
        with open(POLICIES_JSON, "r", encoding="utf-8") as f:
            rows = json.load(f)
        if not isinstance(rows, list):
            rows = []
    except Exception:
        rows = []

    by_id: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        if isinstance(r, dict) and r.get("id"):
            by_id[str(r["id"])] = r

    legacy_map = {
        "POL_SAMPLE": "POL_01",
        "POL_DOM_1": "POL_02",
        "POL_DOM_2": "POL_03",
    }

    changed = False

    for old_id, new_id in legacy_map.items():
        if old_id in by_id and new_id not in by_id:
            src = json.loads(json.dumps(by_id[old_id]))
            src["id"] = new_id
            src.setdefault("name", "")
            src.setdefault("changeLog", [])
            src["changeLog"].append({"at": now_dt, "action": "migrate_from_" + old_id, "fields": ["id"]})
            rows.append(src)
            by_id[new_id] = src
            changed = True

    
    # seed default values once (do not overwrite after user edits)
    for pid, p in list(by_id.items()):
        if not isinstance(p, dict):
            continue
        if p.get("seeded_defaults") is True:
            continue
        # Apply 최신 기본값 (대표님 기준값). 사용자는 이후 저장으로 변경 가능.
        base = json.loads(json.dumps(template_policy))
        # preserve identity fields
        base["id"] = p.get("id", pid)
        base["name"] = p.get("name", "")
        base["changeLog"] = p.get("changeLog", [])
        base["seeded_defaults"] = True
        base["changeLog"].append({"at": now_dt, "action": "seed_defaults", "fields": ["insurance","mileage","penalty","service","driver"]})
        # Replace core policy sections
        p.update({
            "seeded_defaults": True,
            "category": base.get("category"),
            "version": base.get("version"),
            "effective_from": base.get("effective_from"),
            "driver": base.get("driver"),
            "mileage": base.get("mileage"),
            "penalty": base.get("penalty"),
            "insurance": base.get("insurance"),
            "service": base.get("service"),
            "extras": base.get("extras", {}),
        })
        # ensure changelog exists
        p.setdefault("changeLog", base["changeLog"])
        changed = True

    for i in range(1, 6):
        pid = f"POL_{i:02d}"
        if pid not in by_id:
            rows.append(_clone(pid, "" if i != 1 else "약관샘플"))
            changed = True

    if changed:
        with open(POLICIES_JSON, "w", encoding="utf-8") as f:
            json.dump(rows, f, ensure_ascii=False, indent=2)


def _load_policies() -> List[Dict[str, Any]]:
    _ensure_policies_store()
    with open(POLICIES_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, list):
        return data
    return []


def _save_policies(rows: List[Dict[str, Any]]) -> None:
    _ensure_policies_store()
    with open(POLICIES_JSON, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)


def _ensure_store() -> None:
    _ensure_runtime_data_dir()
    _seed_runtime_file_if_missing("vehicles.json")
    _seed_runtime_file_if_missing("chat_rooms.json")
    if not os.path.exists(VEHICLES_JSON):
        with open(VEHICLES_JSON, "w", encoding="utf-8") as f:
            json.dump([], f, ensure_ascii=False, indent=2)

    if not os.path.exists(CHATROOMS_JSON):
        with open(CHATROOMS_JSON, "w", encoding="utf-8") as f:
            json.dump([], f, ensure_ascii=False, indent=2)



AUDIT_LOG = os.path.join(DATA_DIR, "audit.jsonl")

def _append_audit(action: str, entity: str, entity_id: str, before: Any = None, after: Any = None, meta: Any = None) -> None:
    """Append an audit trail record as JSON lines. Best-effort; never raise."""
    try:
        _ensure_runtime_data_dir()
        rec = {
            "ts": _now_iso(),
            "action": action,
            "entity": entity,
            "id": entity_id,
        }
        if meta is not None:
            rec["meta"] = meta
        if before is not None:
            rec["before"] = before
        if after is not None:
            rec["after"] = after
        with open(AUDIT_LOG, "a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    except Exception:
        pass



def _canon(value: Any) -> str:
    """Canonicalize identifiers such as car numbers for stable matching.
    - Remove spaces and hyphens.
    - Keep other characters (including Korean letters) intact.
    """
    s = str(value or "").strip()
    if not s:
        return ""
    return re.sub(r"[\s\-]+", "", s)

def _load_vehicles() -> List[Dict[str, Any]]:
    _ensure_store()
    with open(VEHICLES_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)

    if not isinstance(data, list):
        return []

    # migrate legacy policy ids only (do NOT auto-assign when missing)
    changed = False
    legacy_map = {"POL_SAMPLE": "POL_01", "POL_DOM_1": "POL_02", "POL_DOM_2": "POL_03"}
    for r in data:
        if not isinstance(r, dict):
            continue
        pid = str(r.get("policyId") or "").strip()
        if pid in legacy_map:
            r["policyId"] = legacy_map[pid]
            changed = True
    if changed:
        _save_vehicles(data)

    return data
def _save_vehicles(rows: List[Dict[str, Any]]) -> None:
    _ensure_store()
    with open(VEHICLES_JSON, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)


def _load_chatrooms() -> List[Dict[str, Any]]:
    _ensure_store()
    try:
        with open(CHATROOMS_JSON, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except FileNotFoundError:
        return []
    except Exception:
        return []

def _save_chatrooms(rows: List[Dict[str, Any]]) -> None:
    _ensure_store()
    with open(CHATROOMS_JSON, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)


def _now_iso() -> str:
    # local time is fine for now (internal tool)
    return datetime.now().isoformat(timespec="seconds")


def _append_change_log(doc: Dict[str, Any], action: str, changes: List[Dict[str, Any]] | None = None) -> None:
    """Append a change log entry into the vehicle document.

    Stored in doc['changeLog'] as list of:
      { at: ISO8601, action: 'create'|'update', changes: [{field,before,after}, ...] }

    This is an internal MVP log for 운영 추적.
    """
    entry: Dict[str, Any] = {"at": _now_iso(), "action": action}
    if changes:
        entry["changes"] = changes
    log = doc.get("changeLog")
    if not isinstance(log, list):
        log = []
    log.append(entry)
    # keep last 50
    if len(log) > 50:
        log = log[-50:]
    doc["changeLog"] = log


def _diff_fields(old: Dict[str, Any], new: Dict[str, Any], keys: List[str]) -> List[Dict[str, Any]]:
    changes: List[Dict[str, Any]] = []
    for k in keys:
        if k in ("createdAt", "updatedAt", "changeLog"):
            continue
        before = old.get(k)
        after = new.get(k)
        if before != after:
            changes.append({"field": k, "before": before, "after": after})
    return changes


def _to_int(v: Any) -> int | None:
    if v is None:
        return None
    s = str(v)
    digits = "".join(ch for ch in s if ch.isdigit())
    if not digits:
        return None
    try:
        return int(digits)
    except Exception:
        return None


def _normalize_vehicle_payload(payload: Dict[str, Any], car_no: str) -> Dict[str, Any]:
    """Normalize known keys so data does not drift between pages.

    Keeps flexible fields, but enforces canonical names for core columns.
    """
    doc: Dict[str, Any] = dict(payload or {})

    # immutable
    doc["carNo"] = car_no

    # policyId is required on save (frontend enforces). Keep empty here; validate in API layer.
    policy_id = str(doc.get("policyId") or doc.get("policy") or "").strip()
    doc["policyId"] = policy_id

    # numeric casts
    for k in ("year", "mileageKm", "displacementCc", "creditGrade", "newCarPrice"):
        if k in doc:
            doc[k] = _to_int(doc.get(k))

    # pricing
    pricing = doc.get("pricing")
    if isinstance(pricing, dict):
        norm_pricing: Dict[str, Any] = {}
        for term, row in pricing.items():
            t = str(term).strip()
            if not t:
                continue
            if not isinstance(row, dict):
                continue
            rent = _to_int(row.get("rent"))
            dep = _to_int(row.get("deposit"))
            buy = _to_int(row.get("buyout"))
            if rent is None and dep is None and buy is None:
                continue
            norm_pricing[t] = {}
            if rent is not None:
                norm_pricing[t]["rent"] = rent
            if dep is not None:
                norm_pricing[t]["deposit"] = dep
            if buy is not None:
                norm_pricing[t]["buyout"] = buy
        doc["pricing"] = norm_pricing

    # trim whitespace on common text keys
    for k in (
        "status",
        "subStatus",
        "kind",
        "maker",
        "model",
        "detailModel",
        "trim",
        "fuel",
        "exColor",
        "inColor",
        "optionsText",
        "photoLink",
        "supplierBizNo",
        "firstRegDate",
        "expireDate",
        "reviewRequired",
    ):
        if k in doc and doc.get(k) is not None:
            doc[k] = str(doc.get(k)).strip()

    return doc


def _csv_export_url_from_any(url: str) -> str | None:
    """Build a Google Sheets CSV export URL from a shared/edit URL.

    Supports:
      - https://docs.google.com/spreadsheets/d/<ID>/edit?gid=0#gid=0
      - https://docs.google.com/spreadsheets/d/<ID>/export?format=csv&gid=0
      - raw csv url (returned as-is)
    """
    u = (url or "").strip()
    if not u:
        return None
    # if already export csv
    if "docs.google.com" in u and "export?format=csv" in u:
        return u
    # if it looks like a raw csv
    if u.lower().endswith(".csv") and u.startswith("http"):
        return u

    m = re.search(r"/spreadsheets/d/([a-zA-Z0-9-_]+)", u)
    if not m:
        return None
    sheet_id = m.group(1)

    parsed = urllib.parse.urlparse(u)
    qs = urllib.parse.parse_qs(parsed.query)
    gid = None
    if "gid" in qs and qs["gid"]:
        gid = qs["gid"][0]
    if gid is None:
        # try fragment like #gid=0
        frag = parsed.fragment or ""
        m2 = re.search(r"gid=(\d+)", frag)
        if m2:
            gid = m2.group(1)
    if gid is None:
        gid = "0"

    return f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid={gid}"


def _sheet_row_to_payload(row: Dict[str, str]) -> Dict[str, Any]:
    """Map Korean header row dict to internal payload keys."""

    def g(*keys: str) -> str:
        for k in keys:
            v = row.get(k)
            if v is not None and str(v).strip() != "":
                return str(v).strip()
        return ""

    payload: Dict[str, Any] = {}
    payload["carNo"] = g("차량번호")
    payload["businessNo"] = g("사업자등록번호", "사업자번호", "공급사사업자등록번호", "공급사사업자번호")
    # policy: sheet에서 '적용약관'(또는 '약관') 컬럼에 1~5를 입력하면 슬롯으로 매핑
    pol_raw = g("적용약관", "약관", "policy", "POLICY").strip()
    pol = ""
    if pol_raw:
        # allow '1'..'5'
        if re.fullmatch(r"[1-5]", pol_raw):
            pol = f"POL_0{pol_raw}"
        # allow already mapped ids
        elif re.fullmatch(r"POL_0[1-5]", pol_raw):
            pol = pol_raw
    payload["policyId"] = pol or "POL_01"

    payload["status"] = g("차량상태")
    payload["subStatus"] = g("세부상태")
    payload["kind"] = g("상품구분")
    payload["maker"] = g("제조사")
    payload["model"] = g("모델명")
    payload["detailModel"] = g("세부모델")
    payload["trim"] = g("세부트림")
    payload["optionsText"] = g("선택옵션")
    payload["exColor"] = g("외부색상")
    payload["inColor"] = g("내부색상")
    payload["fuel"] = g("연료")
    payload["mileageKm"] = g("주행거리")
    payload["displacementCc"] = g("배기량")
    payload["firstRegDate"] = g("최초등록일")
    payload["expireDate"] = g("차령만료일")
    payload["photoLink"] = g("사진링크")
    payload["creditGrade"] = g("신용등급")
    payload["reviewRequired"] = g("심사여부")

    # pricing terms
    pricing: Dict[str, Any] = {}
    terms = ["6", "12", "24", "36", "48", "60"]
    for t in terms:
        rent = g(f"금액_대여료_{t}M")
        dep = g(f"금액_보증금_{t}M")
        if rent.strip() == "" and dep.strip() == "":
            continue
        pricing[t] = {"rent": rent, "deposit": dep}
    if pricing:
        payload["pricing"] = pricing

    return payload


def _read_csv_rows(csv_text: str) -> List[Dict[str, str]]:
    # Normalize newlines
    buf = io.StringIO(csv_text)
    reader = csv.reader(buf)
    rows = list(reader)
    if not rows:
        return []
    header = rows[0]

    # handle duplicate headers by keeping order and allowing merge
    header_norm = [str(h).strip() for h in header]

    out: List[Dict[str, str]] = []
    for r in rows[1:]:
        if not any(str(x).strip() for x in r):
            continue
        row_dict: Dict[str, str] = {}
        for i, h in enumerate(header_norm):
            if not h:
                continue
            v = r[i] if i < len(r) else ""
            v = str(v).strip()
            if h in row_dict:
                # prefer non-empty (duplicate header case)
                if row_dict[h].strip() == "" and v != "":
                    row_dict[h] = v
            else:
                row_dict[h] = v
        out.append(row_dict)
    return out



# -----------------------------
# Local users (safe MVP auth)
# -----------------------------
def _ensure_user_stores() -> None:
    _ensure_runtime_data_dir()

    # Seed runtime files from repo data (serverless uses /tmp, repo FS is read-only)
    _seed_runtime_file_if_missing("users.json")
    _seed_runtime_file_if_missing("users_pending.json")
    _seed_runtime_file_if_missing("users_rejected.json")
    _seed_runtime_file_if_missing("partners.json")

    if not os.path.exists(USERS_JSON):
        with open(USERS_JSON, "w", encoding="utf-8") as f:
            json.dump([], f, ensure_ascii=False, indent=2)
    if not os.path.exists(USERS_PENDING_JSON):
        with open(USERS_PENDING_JSON, "w", encoding="utf-8") as f:
            json.dump([], f, ensure_ascii=False, indent=2)
    if not os.path.exists(USERS_REJECTED_JSON):
        with open(USERS_REJECTED_JSON, "w", encoding="utf-8") as f:
            json.dump([], f, ensure_ascii=False, indent=2)

    # partners master
    if not os.path.exists(PARTNERS_JSON):
        with open(PARTNERS_JSON, "w", encoding="utf-8") as f:
            json.dump([], f, ensure_ascii=False, indent=2)

def _load_users(path: str) -> List[Dict[str, Any]]:
    _ensure_user_stores()
    try:
        with open(path, "r", encoding="utf-8") as f:
            rows = json.load(f)
        if not isinstance(rows, list):
            return []
        return [r for r in rows if isinstance(r, dict)]
    except Exception:
        return []

def _save_users(path: str, rows: List[Dict[str, Any]]) -> None:
    _ensure_runtime_data_dir()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)


def _load_partners() -> List[Dict[str, Any]]:
    _ensure_user_stores()
    try:
        with open(PARTNERS_JSON, "r", encoding="utf-8") as f:
            rows = json.load(f)
        if not isinstance(rows, list):
            return []
        return [r for r in rows if isinstance(r, dict)]
    except Exception:
        return []


def _save_partners(rows: List[Dict[str, Any]]) -> None:
    _ensure_runtime_data_dir()
    with open(PARTNERS_JSON, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)

def _biz_digits(v: str) -> str:
    return re.sub(r"\D", "", str(v or ""))

def _normalize_business_no(v: str) -> str:
    """Normalize business registration number to '000-00-00000'.
    Returns empty string if invalid.
    """
    digits = _biz_digits(v)
    if len(digits) != 10:
        return ""
    return f"{digits[0:3]}-{digits[3:5]}-{digits[5:10]}"

def _find_partner_by_business_no(biz_norm: str) -> Dict[str, Any] | None:
    if not biz_norm:
        return None
    rows = _load_partners()
    for r in rows:
        if str(r.get("business_no") or "") == biz_norm:
            return r
    return None

def _backfill_partner_membership(biz_norm: str, partner_code: str, company_name: str) -> int:
    """Backfill partner membership into pending/active/rejected users by business_no.
    Returns number of updated user rows across all stores.
    """
    if not biz_norm:
        return 0

    updated = 0
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    def _apply(path: str):
        nonlocal updated
        rows = _load_users(path)
        changed = False
        for u in rows:
            u_biz = _normalize_business_no(u.get("business_no") or u.get("businessNo") or "")
            if u_biz and u_biz == biz_norm:
                if u.get("partner_code") != partner_code or u.get("partner_company_name") != company_name or u.get("business_no") != biz_norm:
                    u["business_no"] = biz_norm
                    u["partner_code"] = partner_code
                    u["partner_company_name"] = company_name
                    u["updated_at"] = now
                    updated += 1
                    changed = True
        if changed:
            _save_users(path, _dedupe_users(rows))

    _apply(USERS_PENDING_JSON)
    _apply(USERS_JSON)
    _apply(USERS_REJECTED_JSON)
    return updated


def _get_next_code(prefix: str, used_codes: List[str]) -> str:
    # prefix: 'S' for agent, 'P' for provider, 'A' for admin
    nums = []
    for c in used_codes:
        if isinstance(c, str) and c.startswith(prefix):
            m = re.match(rf"{prefix}(\d+)", c)
            if m:
                try:
                    nums.append(int(m.group(1)))
                except Exception:
                    pass
    n = (max(nums) + 1) if nums else 1
    return f"{prefix}{n:04d}"

def _seed_admin_if_missing() -> None:
    """Local seed was used in Local-MVP. With Firebase Auth, admin is bootstrapped
    from a Firebase account (BOOTSTRAP_ADMIN_EMAIL) on first successful login.

    This function is kept for backward compatibility and intentionally does nothing.
    """
    return


def _get_firebase_certs() -> dict:
    now = time.time()
    if _fb_certs_cache["certs"] and (now - _fb_certs_cache["ts"] < _FB_CERTS_TTL_SEC):
        return _fb_certs_cache["certs"]

    # Vercel/serverless environments can intermittently fail outbound HTTPS fetches
    # (DNS/TLS/transient networking). To reduce flakiness, we:
    #   1) retry a few times with progressive timeouts
    #   2) fall back to urllib if requests fails
    #   3) keep client-facing error stable ("cert_fetch_failed") but log details.
    certs: dict = {}
    last_err: str = ""
    timeouts = (5, 8, 12)

    for i, t in enumerate(timeouts, start=1):
        try:
            resp = requests.get(
                FIREBASE_CERTS_URL,
                timeout=t,
                headers={"User-Agent": f"freepass-erp/{APP_VERSION} (python-requests)"},
            )
            resp.raise_for_status()
            certs = resp.json() or {}
            if certs:
                break
        except Exception as e:
            last_err = f"requests attempt {i} failed: {type(e).__name__}: {e}"
            certs = {}

    if not certs:
        for i, t in enumerate(timeouts, start=1):
            try:
                req = urllib.request.Request(
                    FIREBASE_CERTS_URL,
                    headers={"User-Agent": f"freepass-erp/{APP_VERSION} (urllib)"},
                )
                with urllib.request.urlopen(req, timeout=t) as r:
                    raw = r.read().decode("utf-8", errors="ignore")
                certs = json.loads(raw) if raw else {}
                if certs:
                    break
            except Exception as e:
                last_err = f"urllib attempt {i} failed: {type(e).__name__}: {e}"
                certs = {}

    if not certs and last_err:
        # Keep user-facing error stable, but log for diagnosis in Vercel Functions logs.
        print(f"[FIREBASE_CERTS] fetch failed: {last_err}")

    if certs:
        _fb_certs_cache["ts"] = now
        _fb_certs_cache["certs"] = certs
    return _fb_certs_cache["certs"]


def verify_firebase_id_token(id_token: str) -> dict:
    """Verify Firebase Auth ID token.

    Primary path:
      - Verify RS256 signature + standard claims using JWKS (PyJWT + crypto backend).

    Fallback path (server-side verification by Google):
      - If the runtime lacks RS256 crypto backend and PyJWT raises "Algorithm not supported",
        call Google's tokeninfo endpoint and validate core claims (aud/iss/exp/sub).
        This avoids local crypto and stabilizes serverless deployments.
    """
    if not id_token or not isinstance(id_token, str):
        raise ValueError("missing_token")

    issuer = f"https://securetoken.google.com/{FIREBASE_PROJECT_ID}"

    def _decode_with_jwks() -> dict:
        global _fb_jwk_client
        if _fb_jwk_client is None:
            _fb_jwk_client = PyJWKClient(FIREBASE_JWKS_URL)
        signing_key = _fb_jwk_client.get_signing_key_from_jwt(id_token)
        return jwt.decode(
            id_token,
            signing_key.key,
            algorithms=["RS256"],
            audience=FIREBASE_PROJECT_ID,
            issuer=issuer,
            options={"require": ["exp", "iat", "aud", "iss", "sub"]},
        )

    def _decode_with_x509() -> dict:
        header = jwt.get_unverified_header(id_token)
        kid = header.get("kid")
        if not kid:
            raise ValueError("invalid_token_header")

        certs = _get_firebase_certs()
        if not certs:
            raise ValueError("cert_fetch_failed")
        cert = certs.get(kid)
        if not cert:
            # refresh once
            _fb_certs_cache["ts"] = 0.0
            certs = _get_firebase_certs()
            cert = certs.get(kid)
        if not cert:
            raise ValueError("cert_not_found")

        return jwt.decode(
            id_token,
            cert,
            algorithms=["RS256"],
            audience=FIREBASE_PROJECT_ID,
            issuer=issuer,
            options={"require": ["exp", "iat", "aud", "iss", "sub"]},
        )

    def _decode_with_tokeninfo() -> dict:
        try:
            resp = requests.get(
                FIREBASE_TOKENINFO_URL,
                params={"id_token": id_token},
                timeout=8,
                headers={"User-Agent": f"freepass-erp/{APP_VERSION}"},
            )
        except Exception as e:
            raise ValueError(f"tokeninfo_fetch_failed:{type(e).__name__}")

        if resp.status_code != 200:
            try:
                j = resp.json()
            except Exception:
                j = {}
            err = (j.get("error_description") or j.get("error") or "tokeninfo_error").strip()
            raise ValueError(err or "tokeninfo_error")

        try:
            claims = resp.json() or {}
        except Exception:
            raise ValueError("tokeninfo_parse_failed")

        aud = str(claims.get("aud") or "")
        iss = str(claims.get("iss") or "")
        sub = str(claims.get("sub") or "")
        exp = str(claims.get("exp") or "")

        if aud != FIREBASE_PROJECT_ID:
            raise ValueError("aud_mismatch")
        if iss != issuer:
            raise ValueError("iss_mismatch")
        if not sub:
            raise ValueError("missing_uid")

        try:
            exp_i = int(exp)
        except Exception:
            exp_i = 0
        if exp_i and exp_i < int(time.time()):
            raise ValueError("token_expired")

        return claims

    try:
        claims = _decode_with_jwks()
    except Exception as e1:
        msg = str(e1) or ""
        if "Algorithm not supported" in msg:
            claims = _decode_with_tokeninfo()
        else:
            try:
                claims = _decode_with_x509()
            except Exception as e2:
                msg2 = str(e2) or ""
                if "Algorithm not supported" in msg2:
                    claims = _decode_with_tokeninfo()
                else:
                    raise

    uid = claims.get("user_id") or claims.get("sub")
    email = (claims.get("email") or "").strip().lower()
    if not uid:
        raise ValueError("missing_uid")
    claims["uid"] = uid
    claims["email"] = email
    return claims

def _find_user_by_email(email: str) -> Dict[str, Any] | None:
    email = (email or "").strip().lower()
    for u in _load_users(USERS_JSON):
        if (u.get("email") or "").strip().lower() == email:
            return u
    return None

def _find_pending_by_email(email: str) -> Dict[str, Any] | None:
    email = (email or "").strip().lower()
    for u in _load_users(USERS_PENDING_JSON):
        if (u.get("email") or "").strip().lower() == email:
            return u
    return None

def _find_rejected_by_email(email: str) -> Dict[str, Any] | None:
    email = (email or "").strip().lower()
    for u in _load_users(USERS_REJECTED_JSON):
        if (u.get("email") or "").strip().lower() == email:
            return u
    return None

def _dedupe_users(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Remove duplicates by email/code while keeping the newest row.

    승인/재처리 과정에서 같은 이메일이 중복 저장되면 로그인 시 오래된 레코드가 먼저 잡혀
    "비밀번호 오류"처럼 보일 수 있다. (local MVP 안전장치)
    """

    def _key(u: Dict[str, Any]) -> str:
        return (u.get("email") or "").strip().lower() or str(u.get("code") or "")

    def _ts(u: Dict[str, Any]) -> str:
        return str(u.get("updated_at") or u.get("approved_at") or u.get("rejected_at") or u.get("created_at") or "")

    best: Dict[str, Dict[str, Any]] = {}
    for u in rows:
        if not isinstance(u, dict):
            continue
        k = _key(u)
        if not k:
            continue
        if k not in best or _ts(u) > _ts(best[k]):
            best[k] = u

    out = list(best.values())
    out.sort(key=lambda r: str(r.get("updated_at") or r.get("approved_at") or r.get("rejected_at") or r.get("created_at") or ""), reverse=True)
    return out

def _current_user() -> Dict[str, Any] | None:
    if not session.get("uid"):
        return None
    return {
        "uid": session.get("uid"),
        "email": session.get("email"),
        "name": session.get("name"),
        "role": session.get("role"),
        "company_code": session.get("company_code"),
        "code": session.get("code"),
    }

def login_required(fn):
    def _wrap(*args, **kwargs):
        if not session.get("uid"):
            # For API calls, return JSON instead of HTML redirects.
            if request.path.startswith("/api/"):
                return jsonify({"ok": False, "error": "unauthorized"}), 401
            return redirect(url_for("login", next=request.path))
        return fn(*args, **kwargs)
    _wrap.__name__ = fn.__name__
    return _wrap

def role_required(*roles: str):
    def _decor(fn):
        def _wrap(*args, **kwargs):
            if not session.get("uid"):
                if request.path.startswith("/api/"):
                    return jsonify({"ok": False, "error": "unauthorized"}), 401
                return redirect(url_for("login", next=request.path))
            if session.get("role") not in roles:
                # For API calls, return JSON instead of HTML error pages.
                if request.path.startswith("/api/"):
                    return jsonify({"ok": False, "error": "forbidden"}), 403
                abort(403)
            return fn(*args, **kwargs)
        _wrap.__name__ = fn.__name__
        return _wrap
    return _decor

@app.context_processor
def inject_user():
    return {"current_user": _current_user()}


# -----------------------------
# Pages (UI shell)
# -----------------------------

# -----------------------------
# Auth pages (Local MVP)
# -----------------------------
@app.get("/login")
def login():
    _ensure_user_stores()
    msg = request.args.get("msg") or ""
    return render_template("pages/login.html", msg=msg)

@app.post("/login")
def login_post():
    # Legacy local-login endpoint (kept so old bookmarks don't 404)
    return redirect(url_for("login", msg="이 버전은 Firebase 로그인 방식입니다. 화면에서 로그인 해주세요."))

@app.get("/signup")
def signup():
    msg = request.args.get("msg") or ""
    return render_template("pages/signup.html", msg=msg)

@app.post("/signup")
def signup_post():
    # Legacy local-signup endpoint
    return redirect(url_for("signup", msg="이 버전은 Firebase 회원가입 방식입니다. 화면에서 회원가입 해주세요."))


# -----------------------------
# Firebase Auth APIs
# -----------------------------
@app.post("/api/auth/session")
def api_auth_session():
    """Create server session using Firebase ID token.

    Request JSON: { idToken: "..." }
    Response JSON: { status: ACTIVE|PENDING|REJECTED|NOT_REGISTERED, ... }
    """
    _ensure_user_stores()
    data = request.get_json(silent=True) or {}
    id_token = data.get("idToken")
    try:
        claims = verify_firebase_id_token(id_token)
    except Exception as e:
        return jsonify({"status": "ERROR", "error": str(e)}), 401

    uid = claims.get("uid")
    email = (claims.get("email") or "").strip().lower()

    # Bootstrap admin account (first login will create ACTIVE admin record)
    if email and email == BOOTSTRAP_ADMIN_EMAIL:
        if not _find_user_by_email(email):
            now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            rows = _load_users(USERS_JSON)
            rows.append({
                "uid": uid,
                "email": email,
                "name": "관리자",
                "role": "ADMIN",
                "company_code": "C0001",
                "business_no": "",
                "code": BOOTSTRAP_ADMIN_CODE,
                "status": "ACTIVE",
                "approved_at": now,
                "created_at": now,
                "updated_at": now,
            })
            _save_users(USERS_JSON, _dedupe_users(rows))

    u = _find_user_by_email(email) if email else None
    # SYNC UID: 첫 로그인 시 또는 계정 재생성 시 uid가 비어있으면 Firebase uid로 자동 갱신 (테스트 계정 지원)
    if u and u.get("status") == "ACTIVE":
        cur_uid = (u.get("uid") or "").strip()
        if uid and (not cur_uid or cur_uid != uid):
            u["uid"] = uid
            u["updated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            rows = _load_users(USERS_JSON)
            for i, row in enumerate(rows):
                if (row.get("email") or "").strip().lower() == email:
                    rows[i] = u
                    break
            _save_users(USERS_JSON, _dedupe_users(rows))

    if u and u.get("status") == "ACTIVE":
        session.clear()
        session["uid"] = u.get("uid")
        session["email"] = u.get("email")
        session["name"] = u.get("name")
        session["role"] = u.get("role")
        session["company_code"] = u.get("company_code")
        session["code"] = u.get("code")
        return jsonify({"status": "ACTIVE", "role": u.get("role")})

    p = _find_pending_by_email(email) if email else None
    if p and p.get("status") == "PENDING":
        return jsonify({"status": "PENDING", "email": email})

    rj = _find_rejected_by_email(email) if email else None
    if rj and rj.get("status") == "REJECTED":
        return jsonify({"status": "REJECTED", "email": email, "reason": rj.get("rejected_reason") or ""})

    return jsonify({"status": "NOT_REGISTERED", "email": email}), 403



@app.get("/api/me")
def api_me():
    """Return current logged-in user session info (JSON)."""
    u = _current_user()
    if not u:
        return jsonify({"ok": False, "error": "unauthorized"}), 401
    return jsonify({"ok": True, "user": u})

@app.post("/api/auth/register-request")
def api_auth_register_request():
    """Register a signup request (PENDING) using Firebase ID token.

    Client must create Firebase Auth user first, then call this API.
    JSON: { idToken, businessNo, phone?, nameTitle?, workplace?, fax? }
    - businessNo: 사업자등록번호 (필수)
    Note: 가입신청 단계에서는 영업/공급사 구분을 받지 않음. 관리자가 승인 시 역할을 지정한다.
    """
    _ensure_user_stores()
    data = request.get_json(silent=True) or {}
    id_token = data.get("idToken")
    business_no = (data.get("businessNo") or data.get("business_no") or "").strip()
    phone = (data.get("phone") or "").strip()
    name_title = (data.get("nameTitle") or data.get("name_title") or "").strip()
    workplace = (data.get("workplace") or "").strip()
    fax = (data.get("fax") or "").strip()

    if not id_token:
        return jsonify({"status": "ERROR", "error": "idToken_required"}), 400
    if not business_no:
        return jsonify({"status": "ERROR", "error": "businessNo_required"}), 400

    biz_norm = _normalize_business_no(business_no)
    if not biz_norm:
        return jsonify({"status": "ERROR", "error": "businessNo_invalid"}), 400

    try:
        claims = verify_firebase_id_token(id_token)
    except Exception as e:
        return jsonify({"status": "ERROR", "error": str(e)}), 401

    uid = claims.get("uid")
    email = (claims.get("email") or "").strip().lower()
    if not email:
        return jsonify({"status": "ERROR", "error": "email_required"}), 400

    if _find_user_by_email(email):
        return jsonify({"status": "ERROR", "error": "already_active"}), 409
    if _find_pending_by_email(email):
        return jsonify({"status": "ERROR", "error": "already_pending"}), 409
    if _find_rejected_by_email(email):
        return jsonify({"status": "ERROR", "error": "rejected_exists"}), 409

    active = _load_users(USERS_JSON)
    pending = _load_users(USERS_PENDING_JSON)
    used_codes = [u.get("code") for u in active + pending if u.get("code")]
    # Pending code is generic (R####). Role code will be allocated on approval.
    code = _get_next_code("R", used_codes)

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    partner = _find_partner_by_business_no(biz_norm)
    partner_code = str(partner.get("partner_code") or "") if partner else ""
    partner_company_name = str(partner.get("company_name") or "") if partner else ""

    pending.append({
        "uid": uid,
        "email": email,
        "business_no": biz_norm,
        "partner_code": partner_code,
        "partner_company_name": partner_company_name,
        "phone": phone,
        "name_title": name_title,
        "workplace": workplace,
        "fax": fax,
        "role": "",
        "company_code": "C0001",
        "code": code,
        "status": "PENDING",
        "created_at": now,
        "updated_at": now,
    })
    _save_users(USERS_PENDING_JSON, _dedupe_users(pending))
    _append_audit("CREATE", "signup_request", code, after={"email": email, "business_no": biz_norm})
    return jsonify({"ok": True, "code": code, "status": "PENDING"})


@app.get("/pending")
def pending():
    email = (request.args.get("email") or "").strip().lower()
    # pending or rejected status view
    p = _find_pending_by_email(email)
    rj = _find_rejected_by_email(email)
    status = "PENDING" if p else ("REJECTED" if rj else "PENDING")
    reason = ""
    if rj:
        reason = str(rj.get("rejected_reason") or "").strip()
    return render_template("pages/pending.html", email=email, status=status, reason=reason)

@app.get("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))

# -----------------------------
# Admin APIs for user approvals (Local MVP)
# -----------------------------
@app.get("/api/admin/pending-users")
@role_required("ADMIN")
def api_admin_pending_users():
    rows = _load_users(USERS_PENDING_JSON)
    # newest first
    rows = sorted(rows, key=lambda r: r.get("created_at") or "", reverse=True)
    return jsonify(rows)
@app.get("/api/admin/active-users")
@role_required("ADMIN")
def api_admin_active_users():
    rows = _load_users(USERS_JSON)
    rows = sorted(rows, key=lambda r: r.get("approved_at") or r.get("created_at") or "", reverse=True)
    return jsonify(rows)

@app.get("/api/admin/rejected-users")
@role_required("ADMIN")
def api_admin_rejected_users():
    rows = _load_users(USERS_REJECTED_JSON)
    rows = sorted(rows, key=lambda r: r.get("rejected_at") or r.get("created_at") or "", reverse=True)
    return jsonify(rows)


# -----------------------------
# Admin APIs for partners (소속 파트너/회사) master (Local MVP)
# -----------------------------
@app.get("/api/admin/partners")
@role_required("ADMIN")
def api_admin_partners_list():
    rows = _load_partners()
    rows = sorted(rows, key=lambda r: r.get("created_at") or r.get("updated_at") or "", reverse=True)
    return jsonify(rows)


@app.post("/api/admin/partners")
@role_required("ADMIN")
def api_admin_partners_upsert():
    """Create/Update partner master.

    JSON: { businessNo, companyName, ceoName?, address?, managerPhone?, taxEmail? }
    - businessNo: required (digits or 000-00-00000)
    - companyName: required
    """
    payload = request.get_json(silent=True) or {}
    biz = str(payload.get("businessNo") or payload.get("business_no") or "").strip()
    name = str(payload.get("companyName") or payload.get("company_name") or "").strip()
    ceo = str(payload.get("ceoName") or payload.get("ceo_name") or "").strip()
    addr = str(payload.get("address") or "").strip()
    mgr_phone = str(payload.get("managerPhone") or payload.get("manager_phone") or "").strip()
    tax_email = str(payload.get("taxEmail") or payload.get("tax_email") or "").strip()

    if not biz:
        return jsonify({"error": "businessNo_required"}), 400
    if not name:
        return jsonify({"error": "companyName_required"}), 400

    # normalize bizNo to 000-00-00000
    digits = re.sub(r"\D", "", biz)
    if len(digits) != 10:
        return jsonify({"error": "businessNo_invalid"}), 400
    biz_norm = f"{digits[0:3]}-{digits[3:5]}-{digits[5:10]}"

    rows = _load_partners()
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # upsert by businessNo
    target = None
    for r in rows:
        if str(r.get("business_no") or "") == biz_norm:
            target = r
            break

    if not target:
        used = [str(r.get("partner_code") or "") for r in rows if r.get("partner_code")]
        partner_code = _get_next_code("B", used)
        new_row = {
            "partner_code": partner_code,
            "business_no": biz_norm,
            "company_name": name,
            "ceo_name": ceo,
            "address": addr,
            "manager_phone": mgr_phone,
            "tax_email": tax_email,
            "status": "ACTIVE",
            "created_at": now,
            "updated_at": now,
        }
        rows.append(new_row)
        _save_partners(rows)
        _append_audit("CREATE", "partner", partner_code, after=new_row)
        backfilled = _backfill_partner_membership(biz_norm, partner_code, name)
        return jsonify({"ok": True, "partner": new_row, "backfilled": backfilled})

    before = dict(target)
    target["company_name"] = name
    target["ceo_name"] = ceo
    target["address"] = addr
    target["manager_phone"] = mgr_phone
    target["tax_email"] = tax_email
    target["updated_at"] = now

    _save_partners(rows)
    _append_audit("UPDATE", "partner", str(target.get("partner_code") or biz_norm), before=before, after=target)
    backfilled = _backfill_partner_membership(biz_norm, str(target.get("partner_code") or ""), name)
    return jsonify({"ok": True, "partner": target, "backfilled": backfilled})
@app.post("/api/admin/rejected-users/<code>/reopen")
@role_required("ADMIN")
def api_admin_reopen_user(code: str):
    rej = _load_users(USERS_REJECTED_JSON)
    target = None
    for r in rej:
        if r.get("code") == code:
            target = r
            break
    if not target:
        return jsonify({"error": "not_found"}), 404

    pend = _load_users(USERS_PENDING_JSON)
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    role_final = str(target.get("role") or "").strip().upper()
    company_code = str(target.get("company_code") or "C0001").strip() or "C0001"

    pend.append({
        "uid": target.get("uid"),
        "email": target.get("email"),
        "password": target.get("password"),
        "name": target.get("name"),
        "role_requested": target.get("role_requested") or target.get("role"),
        "role": role_final,
        "company_code": company_code,
        "business_no": target.get("business_no") or "",
        "partner_code": target.get("partner_code") or "",
        "partner_company_name": target.get("partner_company_name") or "",
        "code": target.get("code"),
        "status": "PENDING",
        "created_at": target.get("created_at") or now,
    })
    _save_users(USERS_PENDING_JSON, pend)

    rej = [r for r in rej if r.get("code") != code]
    _save_users(USERS_REJECTED_JSON, rej)
    return jsonify({"ok": True})


@app.post("/api/admin/active-users/<code>/to-pending")
@role_required("ADMIN")
def api_admin_active_to_pending(code: str):
    """Move an ACTIVE user back to PENDING (re-approval)."""
    users = _load_users(USERS_JSON)
    target = None
    for u in users:
        if str(u.get("code") or "") == str(code):
            target = u
            break
    if not target:
        return jsonify({"error": "not_found"}), 404

    # remove from ACTIVE
    users = [u for u in users if str(u.get("code") or "") != str(code)]
    _save_users(USERS_JSON, _dedupe_users(users))

    # add into PENDING
    pend = _load_users(USERS_PENDING_JSON)
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    pend = [p for p in pend if str(p.get("code") or "") != str(code) and (p.get("email") or "").strip().lower() != (target.get("email") or "").strip().lower()]
    role_final = str(target.get("role") or "").strip().upper()
    company_code = str(target.get("company_code") or "C0001").strip() or "C0001"

    pend.append({
        "uid": target.get("uid") or f"pending_{code}",
        "email": (target.get("email") or "").strip().lower(),
        "password": target.get("password"),
        "name": target.get("name"),
        "role_requested": target.get("role_requested") or target.get("role"),
        "role": role_final,
        "company_code": company_code,
        "business_no": target.get("business_no") or "",
        "partner_code": target.get("partner_code") or "",
        "partner_company_name": target.get("partner_company_name") or "",
        "code": str(target.get("code") or code),
        "status": "PENDING",
        "created_at": target.get("created_at") or now,
        "updated_at": now,
    })
    _save_users(USERS_PENDING_JSON, pend)
    return jsonify({"ok": True})


@app.post("/api/admin/active-users/<code>/reject")
@role_required("ADMIN")
def api_admin_active_reject(code: str):
    """Reject an ACTIVE user (move to REJECTED store)."""
    users = _load_users(USERS_JSON)
    target = None
    for u in users:
        if str(u.get("code") or "") == str(code):
            target = u
            break
    if not target:
        return jsonify({"error": "not_found"}), 404

    payload = request.get_json(silent=True) or {}
    reason = str(payload.get("reason") or "").strip()

    role_final = str(target.get("role") or "").strip().upper()
    company_code = str(target.get("company_code") or "C0001").strip() or "C0001"

    # remove from ACTIVE
    users = [u for u in users if str(u.get("code") or "") != str(code)]
    _save_users(USERS_JSON, _dedupe_users(users))

    # add into REJECTED
    rejected = _load_users(USERS_REJECTED_JSON)
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    email = (target.get("email") or "").strip().lower()
    rejected = [r for r in rejected if (r.get("email") or "").strip().lower() != email and str(r.get("code") or "") != str(code)]
    rejected.append({
        "uid": target.get("uid"),
        "email": email,
        "password": target.get("password"),
        "name": target.get("name"),
        "role_requested": target.get("role_requested") or target.get("role"),
        "role": role_final,
        "company_code": company_code,
        "business_no": target.get("business_no") or "",
        "partner_code": target.get("partner_code") or "",
        "partner_company_name": target.get("partner_company_name") or "",
        "code": str(target.get("code") or code),
        "status": "REJECTED",
        "created_at": target.get("created_at") or now,
        "rejected_at": now,
        "rejected_reason": reason,
        "updated_at": now,
    })
    _save_users(USERS_REJECTED_JSON, rejected)
    return jsonify({"ok": True})



@app.post("/api/admin/pending-users/<code>/approve")
@role_required("ADMIN")
def api_admin_approve_user(code: str):
    pend = _load_users(USERS_PENDING_JSON)
    target = None
    for r in pend:
        if r.get("code") == code:
            target = r
            break
    if not target:
        return jsonify({"error": "not_found"}), 404

    payload = request.get_json(silent=True) or {}
    role_final = str(payload.get('roleFinal') or payload.get('role') or target.get('role') or 'AGENT').strip().upper()
    if role_final not in ('ADMIN','AGENT','PROVIDER'):
        role_final = str(target.get('role') or 'AGENT').strip().upper()
    company_code = str(payload.get('companyCode') or target.get('company_code') or 'C0001').strip() or 'C0001'
    # If admin overrides role, regenerate code prefix to match (S#### / P####).
    codev = str(target.get('code') or '')
    if role_final in ('AGENT','PROVIDER'):
        prefix = 'S' if role_final=='AGENT' else 'P'
        if not (len(codev)==5 and codev.startswith(prefix)):
            active_all = _load_users(USERS_JSON)
            pending_all = _load_users(USERS_PENDING_JSON)
            rejected_all = _load_users(USERS_REJECTED_JSON)
            used_codes = [u.get('code') for u in (active_all+pending_all+rejected_all) if u.get('code')]
            codev = _get_next_code(prefix, used_codes)

    users = _load_users(USERS_JSON)
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    email = (target.get("email") or "").strip().lower()
    # remove duplicates
    users = [u for u in users if (u.get("email") or "").strip().lower() != email and str(u.get("code") or "") != codev]
    users.append({
        "uid": str(target.get("uid") or "").replace("pending_", ""),
        "email": email,
        "password": target.get("password"),
        "name": target.get("name"),
        "role_requested": target.get("role_requested") or target.get("role"),
        "role": role_final,
        "company_code": company_code,
        "business_no": target.get("business_no") or "",
        "partner_code": target.get("partner_code") or "",
        "partner_company_name": target.get("partner_company_name") or "",
        "code": codev,
        "status": "ACTIVE",
        "created_at": target.get("created_at") or now,
        "approved_at": now,
        "updated_at": now,
    })
    users = _dedupe_users(users)
    _save_users(USERS_JSON, users)

    # If same user existed in rejected store, remove it.
    rejected = _load_users(USERS_REJECTED_JSON)
    rejected = [r for r in rejected if (r.get("email") or "").strip().lower() != email and str(r.get("code") or "") != codev]
    _save_users(USERS_REJECTED_JSON, rejected)

    pend = [r for r in pend if r.get("code") != code]
    _save_users(USERS_PENDING_JSON, pend)
    return jsonify({"ok": True})

@app.post("/api/admin/pending-users/<code>/reject")
@role_required("ADMIN")
def api_admin_reject_user(code: str):
    pend = _load_users(USERS_PENDING_JSON)
    target = None
    for r in pend:
        if r.get("code") == code:
            target = r
            break
    if not target:
        return jsonify({"error": "not_found"}), 404

    payload = request.get_json(silent=True) or {}
    reason = str(payload.get("reason") or "").strip()

    role_final = str(target.get("role") or "").strip().upper()
    company_code = str(target.get("company_code") or "C0001").strip() or "C0001"

    rejected = _load_users(USERS_REJECTED_JSON)
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    rejected.append({
        "uid": target.get("uid"),
        "email": target.get("email"),
        "password": target.get("password"),
        "name": target.get("name"),
        "role_requested": target.get("role_requested") or target.get("role"),
        "role": role_final,
        "company_code": company_code,
        "business_no": target.get("business_no") or "",
        "partner_code": target.get("partner_code") or "",
        "partner_company_name": target.get("partner_company_name") or "",
        "code": target.get("code"),
        "status": "REJECTED",
        "created_at": target.get("created_at") or now,
        "rejected_at": now,
        "rejected_reason": reason,
    })
    _save_users(USERS_REJECTED_JSON, rejected)

    pend = [r for r in pend if r.get("code") != code]
    _save_users(USERS_PENDING_JSON, pend)
    return jsonify({"ok": True})

@app.get("/")
@login_required
def index():
    return redirect(url_for("products"))


@app.get("/products")
@login_required
def products():
    return render_template("pages/products.html", active_page="products", page_title="상품")


@app.get("/chats")
@login_required
def chats():
    return render_template("pages/chats.html", active_page="chats", page_title="대화")


@app.get("/requests")
@login_required
def requests():
    return render_template("pages/requests.html", active_page="requests", page_title="요청")


@app.get("/approvals")
@role_required("ADMIN")
def approvals():
    return render_template("pages/approvals.html", active_page="approvals", page_title="승인")


@app.get("/register")
@role_required("ADMIN", "PROVIDER")
def register():
    return render_template("pages/register.html", active_page="register", page_title="등록")


@app.get("/settlements")
@role_required("ADMIN")
def settlements():
    return render_template("pages/settlements.html", active_page="settlements", page_title="정산")


@app.get("/settings")
@login_required
def settings():
    return render_template("pages/settings.html", active_page="settings", page_title="설정")


@app.get("/sample-data")
@login_required
def sample_data():
    return render_template("pages/sample_data.html", active_page="sample_data", page_title="샘플데이터")


# -----------------------------


# API: vehicle master (maker/model/detail) - local JSON

@app.get("/api/vehicle_master")
@login_required
def api_vehicle_master():
    # returns hierarchical master for maker -> model -> detail
    try:
        if not os.path.exists(VEHICLE_MASTER_JSON):
            return jsonify({"version": None, "makers": []})
        with open(VEHICLE_MASTER_JSON, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            data = {"version": None, "makers": []}
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": "load_failed", "detail": str(e)}), 500

# API: policies (local JSON)



# API: vehicle photo uploads (local MVP)
@app.post("/api/uploads/vehicle_photos")
@login_required
def api_upload_vehicle_photos():
    os.makedirs(UPLOAD_VEHICLE_DIR, exist_ok=True)
    files = request.files.getlist("files")
    if not files:
        return jsonify({"urls": []})
    urls = []
    ts = int(time.time())
    for i, f in enumerate(files):
        if not f:
            continue
        filename = secure_filename(f.filename or "")
        if not filename:
            filename = f"photo_{ts}_{i}.bin"
        # keep extension if present
        base, ext = os.path.splitext(filename)
        if not ext:
            ext = ".jpg"
        safe = f"{base[:40]}_{ts}_{i}{ext}"
        save_path = os.path.join(UPLOAD_VEHICLE_DIR, safe)
        f.save(save_path)
        # public url
        urls.append(url_for("static", filename=f"uploads/vehicles/{safe}", _external=False))
    return jsonify({"urls": urls})


@app.get("/api/policies")
@login_required
def api_policies_list():
    # returns dict keyed by policy_id
    rows = _load_policies()
    out = {}
    for p in rows:
        pid = p.get("id")
        if pid:
            out[pid] = p
    return jsonify(out)


@app.put("/api/policies/<policy_id>")
@login_required
def api_policies_update(policy_id: str):
    payload = request.get_json(force=True, silent=True) or {}
    rows = _load_policies()
    found = None
    for p in rows:
        if p.get("id") == policy_id:
            found = p
            break
    if not found:
        return jsonify({"error": "not_found"}), 404

    before = json.loads(json.dumps(found))
    # update allowed fields only
    found["category"] = str(payload.get("category") or found.get("category") or "DOMESTIC")
    found["name"] = str(payload.get("name") or found.get("name") or "")

    found["driver"] = payload.get("driver") or found.get("driver") or {}
    found["mileage"] = payload.get("mileage") or found.get("mileage") or {}
    found["penalty"] = payload.get("penalty") or found.get("penalty") or {}
    found["service"] = payload.get("service") or found.get("service") or {}
    found["insurance"] = payload.get("insurance") or found.get("insurance") or {}
    found["review"] = payload.get("review") or found.get("review") or {}

    # normalize numeric helpers
    def _to_int(v):
        if v is None or v == "":
            return None
        try:
            return int(str(v).replace(",", "").strip())
        except Exception:
            return None

    # driver
    drv = found.get("driver") or {}
    drv["base_min_age"] = _to_int(drv.get("base_min_age")) or 26
    found["driver"] = drv

    # mileage
    mil = found.get("mileage") or {}
    mil["contract_km_per_year"] = _to_int(mil.get("contract_km_per_year"))
    mil["over_km_fee"] = _to_int(mil.get("over_km_fee"))
    found["mileage"] = mil

    pen = found.get("penalty") or {}
    pen["over_mileage_rate"] = _to_int(pen.get("over_mileage_rate"))
    found["penalty"] = pen

    srv = found.get("service") or {}
    rs = srv.get("roadside") or {}
    rs["max_uses"] = _to_int(rs.get("max_uses"))
    srv["roadside"] = rs
    found["service"] = srv

    # insurance normalize: for common coverages store dict {type, amount, deductible_amount}
    def _norm_limit(obj):
        if not obj:
            return {"type": None, "amount": None, "deductible_amount": None}
        t = obj.get("type")
        amt = _to_int(obj.get("amount"))
        ded = _to_int(obj.get("deductible_amount"))
        if t == "UNLIMITED":
            return {"type": "UNLIMITED", "amount": None, "deductible_amount": ded}
        if amt is None:
            return {"type": None, "amount": None, "deductible_amount": ded}
        return {"type": "AMOUNT", "amount": amt, "deductible_amount": ded}

    ins = found.get("insurance") or {}
    ins["liability_bodily"] = _norm_limit(ins.get("liability_bodily"))
    # business rule: 대인 보상한도는 항상 무한(고정)
    _ded = ins["liability_bodily"].get("deductible_amount")
    ins["liability_bodily"] = {"type": "UNLIMITED", "amount": None, "deductible_amount": _ded}
    ins["liability_property"] = _norm_limit(ins.get("liability_property"))
    ins["personal_injury"] = _norm_limit(ins.get("personal_injury"))
    ins["uninsured"] = _norm_limit(ins.get("uninsured"))

    # collision structured
    col = ins.get("collision") or {}
    lim = col.get("limit") or {}
    ded = col.get("deductible") or {}

    # legacy fields (백만원 단위) - 유지하되, 현재 UI는 won 기반을 우선 사용
    lim["min_million"] = _to_int(lim.get("min_million"))
    lim["max_million"] = _to_int(lim.get("max_million"))

    # NEW: collision limit type
    lim_type = str(lim.get("type") or "UP_TO_VEHICLE_VALUE").strip().upper()
    if lim_type not in ("UP_TO_VEHICLE_VALUE", "AMOUNT"):
        lim_type = "UP_TO_VEHICLE_VALUE"
    lim["type"] = lim_type
    lim["amount_won"] = _to_int(lim.get("amount_won")) if lim_type == "AMOUNT" else None
    ded["percent"] = _to_int(ded.get("percent"))
    # NEW: store collision deductible min/max in WON to support 50만원(=0.5백만원) 같은 값
    min_won = _to_int(ded.get("min_won"))
    max_won = _to_int(ded.get("max_won"))
    if min_won is None:
        mm = _to_int(ded.get("min_million"))
        min_won = (mm * 1000000) if mm is not None else None
    if max_won is None:
        mxm = _to_int(ded.get("max_million"))
        max_won = (mxm * 1000000) if mxm is not None else None
    ded["min_won"] = min_won
    ded["max_won"] = max_won
    # keep legacy fields if present (백만원 단위 정수만)
    ded["min_million"] = _to_int(ded.get("min_million"))
    ded["max_million"] = _to_int(ded.get("max_million"))
    col["limit"] = lim
    col["deductible"] = ded
    ins["collision"] = col
    found["insurance"] = ins

    # change log
    fields = payload.get("_logFields") or []
    if not isinstance(fields, list):
        fields = []
    log = found.get("changeLog") or []
    log.append({
        "at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "action": "update",
        "fields": fields[:50],
    })
    found["changeLog"] = log[-200:]

    _save_policies(rows)
    _append_audit("policy_update", "policy", policy_id, before=before, after=found)
    return jsonify(found)
@app.get("/api/vehicles")
@login_required
def api_list_vehicles():
    rows = _load_vehicles()
    role = session.get("role")
    if role == "PROVIDER":
        my_code = str(session.get("code") or "").strip()
        # Providers must only see vehicles they registered (providerCode match).
        # If providerCode is missing, hide it (privacy first).
        rows = [r for r in rows if str((r.get("providerCode") or r.get("provider_code") or "")).strip() == my_code]
    # newest first (optional)
    rows = sorted(rows, key=lambda r: str(r.get("createdAt", "")), reverse=True)
    return jsonify({"ok": True, "items": rows})


@app.get("/api/vehicles_all")
@login_required
def api_list_vehicles_all():
    """Return all vehicles for any logged-in user.

    NOTE: This endpoint is intentionally NOT role-filtered.
    Use /api/vehicles for role-scoped views (e.g., provider-only on register page).
    """
    rows = _load_vehicles()
    rows = sorted(rows, key=lambda r: str(r.get("createdAt", "")), reverse=True)
    return jsonify({"ok": True, "items": rows})



@app.post("/api/chat/open")
@login_required
@role_required("AGENT")
def api_chat_open():
    """Ensure chat room id for an agent inquiry.

    roomId = carNoNorm + agentCode + yymmdd (KST)

    Notes:
    - v004부터 방 메타는 클라이언트가 Firestore(rooms 컬렉션)에 저장/조회한다.
      (서버는 roomId/메타 계산만 담당)
    """
    try:
        payload = request.get_json(silent=True) or {}
        car_no = str(payload.get("carNo") or payload.get("car_no") or "").strip()
        if not car_no:
            return jsonify({"ok": False, "error": "carNo is required"}), 400

        key = _canon(car_no)
        rows = _load_vehicles()
        found = None
        for r in rows:
            if _canon(r.get("carNo") or r.get("car_no") or "") == key:
                found = r
                break
        if not found:
            return jsonify({"ok": False, "error": "vehicle not found"}), 404

        role = str(session.get("role") or "").upper()
        if role != "AGENT" and role != "ADMIN":
            # only agent/admin can initiate chat from product inquiry flow
            return jsonify({"ok": False, "error": "forbidden"}), 403

        agent_code = str(session.get("code") or "").strip()
        if not agent_code:
            return jsonify({"ok": False, "error": "missing agent code"}), 400

        # provider ownership fields (may be blank for legacy data)
        provider_code = str(found.get("providerCode") or found.get("provider_code") or "").strip()
        provider_company = str(found.get("providerCompanyCode") or found.get("provider_company_code") or "").strip()

        # legacy backfill: if company missing but provider_code exists, infer from users.json
        if not provider_company and provider_code:
            for u in _load_users(USERS_JSON):
                if str(u.get("code") or "").strip() == provider_code:
                    provider_company = str(u.get("company_code") or "").strip()
                    break

        # canonical date (KST) for room id
        try:
            kst = timezone(timedelta(hours=9))
            yymmdd = datetime.now(kst).strftime("%y%m%d")
        except Exception:
            yymmdd = datetime.now().strftime("%y%m%d")

        room_id = f"{key}{agent_code}{yymmdd}"

        detail_model = str(
            payload.get("detailModel")
            or payload.get("detail_model")
            or found.get("detailModel")
            or found.get("trim")
            or ""
        ).strip()

        return jsonify({
            "ok": True,
            "roomId": room_id,
            "carNo": str(found.get("carNo") or car_no).strip(),
            "carNoNorm": key,
            "agentCode": agent_code,
            "providerCode": provider_code,
            "providerCompanyCode": provider_company,
            "yymmdd": yymmdd,
            "detailModel": detail_model,
        })
    except Exception as e:
        return jsonify({"ok": False, "error": f"chat_open_failed: {e}"}), 500



@app.get("/api/chat/rooms")
@login_required
def api_chat_rooms():
    """Return chat room list filtered by role.
    - AGENT: rooms where agentCode == my code
    - PROVIDER: rooms where providerCompanyCode == my company_code
    - ADMIN: all rooms
    """
    role = str(session.get("role") or "").upper()
    code = str(session.get("code") or "")
    company = str(session.get("company_code") or "")

    rooms = _load_chatrooms()
    out = []
    for r in rooms:
        if not isinstance(r, dict):
            continue
        if role == "ADMIN":
            out.append(r)
        elif role == "PROVIDER":
            if company and str(r.get("providerCompanyCode") or "") == company:
                out.append(r)
        else:  # AGENT
            if code and str(r.get("agentCode") or "") == code:
                out.append(r)

    out.sort(key=lambda x: int(x.get("updatedAt") or 0), reverse=True)
    return jsonify({"ok": True, "items": out})

@app.post("/api/vehicles")
@login_required
def api_create_vehicle():
    payload = request.get_json(silent=True) or {}

    # Minimal required field
    car_no = str(payload.get("carNo") or payload.get("car_no") or "").strip()
    if not car_no:
        return jsonify({"ok": False, "error": "carNo is required"}), 400

    rows = _load_vehicles()
    exists = any(str(r.get("carNo", "")).strip() == car_no for r in rows)
    if exists:
        return jsonify({"ok": False, "error": "duplicate carNo"}), 409

    # Store as a flexible document (MVP) + normalize
    doc = _normalize_vehicle_payload(payload, car_no)
    doc.setdefault("createdAt", _now_iso())

    # ownership
    role = session.get("role")
    if role == "PROVIDER":
        doc["providerCode"] = str(session.get("code") or "").strip()
        # provider-created vehicles are always assigned to provider's company (business number)
        doc["supplierBizNo"] = str(session.get("company_code") or session.get("companyCode") or "").strip() or doc.get("supplierBizNo")

    # policyId: 기본값은 POL_01 (약관1)
    allowed_policies = {"POL_01", "POL_02", "POL_03", "POL_04", "POL_05"}
    pid = str(doc.get("policyId") or "").strip()
    if not pid or pid not in allowed_policies:
        doc["policyId"] = "POL_01"

    # change log
    _append_change_log(doc, "create")

    rows.append(doc)
    _save_vehicles(rows)
    _append_audit("vehicle_create", "vehicle", car_no, before=None, after=doc)
    return jsonify({"ok": True, "item": doc})



@app.put("/api/vehicles/<path:car_no>")
@login_required
def api_update_vehicle(car_no: str):
    payload = request.get_json(silent=True) or {}
    car_no = str(car_no or "").strip()
    if not car_no:
        return jsonify({"ok": False, "error": "carNo is required"}), 400

    rows = _load_vehicles()
    idx = None
    for i, r in enumerate(rows):
        if str(r.get("carNo", "")).strip() == car_no:
            idx = i
            break
    if idx is None:
        return jsonify({"ok": False, "error": "not found"}), 404

    # Keep immutable id fields

    # role-based ownership enforcement
    role = session.get("role")
    if role == "PROVIDER":
        my_code = str(session.get("code") or "").strip()
        owner = str((rows[idx].get("providerCode") or rows[idx].get("provider_code") or "")).strip()
        if owner != my_code:
            return jsonify({"ok": False, "error": "forbidden"}), 403
        # provider cannot reassign supplierBizNo
        doc_supplier = str(session.get("company_code") or session.get("companyCode") or "").strip()
        if doc_supplier:
            rows[idx]["supplierBizNo"] = doc_supplier
    old = rows[idx]
    before = json.loads(json.dumps(old))
    doc: Dict[str, Any] = dict(old)
    payload_keys: List[str] = []
    for k, v in (payload or {}).items():
        # never allow carNo overwrite here
        if k in ("carNo", "car_no"):
            continue
        if role == "PROVIDER" and k in ("supplierBizNo", "supplier_biz_no"):
            continue
        doc[k] = v
        payload_keys.append(k)

    # normalize merged document
    doc = _normalize_vehicle_payload(doc, car_no)
    doc.setdefault("createdAt", old.get("createdAt") or _now_iso())
    doc["updatedAt"] = _now_iso()

    # keep ownership
    if role == "PROVIDER":
        doc["providerCode"] = my_code

    # policyId: 기본값은 POL_01 (약관1)
    allowed_policies = {"POL_01", "POL_02", "POL_03", "POL_04", "POL_05"}
    pid = str(doc.get("policyId") or "").strip()
    if not pid or pid not in allowed_policies:
        doc["policyId"] = "POL_01"

    # change log (only when there are changes)
    changes = _diff_fields(old, doc, payload_keys)
    if changes:
        _append_change_log(doc, "update", changes)

    rows[idx] = doc
    _save_vehicles(rows)
    _append_audit("vehicle_update", "vehicle", car_no, before=before, after=doc)
    return jsonify({"ok": True, "item": doc})


@app.delete("/api/vehicles/<path:car_no>")
@login_required
def api_delete_vehicle(car_no: str):
    # Be tolerant: car numbers can contain spaces/hyphens and may be URL-encoded.
    # Normalize both the incoming key and stored values to avoid false "not found".
    car_no = str(car_no or "")
    try:
        from urllib.parse import unquote
        car_no = unquote(car_no)
    except Exception:
        pass
    car_no = car_no.strip()
    if not car_no:
        return jsonify({"ok": False, "error": "carNo is required"}), 400

    def _canon(x: Any) -> str:
        s = str(x or "")
        try:
            from urllib.parse import unquote
            s = unquote(s)
        except Exception:
            pass
        s = s.strip().upper()
        # remove common separators that users may type differently
        s = s.replace(" ", "").replace("-", "")
        return s

    key = _canon(car_no)

    rows = _load_vehicles()

    role = session.get("role")
    if role == "PROVIDER":
        my_code = str(session.get("code") or "").strip()
        target = None
        for r in rows:
            if _canon(r.get("carNo", "")) == key:
                target = r
                break
        if target is None:
            return jsonify({"ok": False, "error": "not found"}), 404
        owner = str((target.get("providerCode") or target.get("provider_code") or "")).strip()
        if owner != my_code:
            return jsonify({"ok": False, "error": "forbidden"}), 403
    new_rows = [r for r in rows if _canon(r.get("carNo", "")) != key]
    if len(new_rows) == len(rows):
        return jsonify({"ok": False, "error": "not found"}), 404

    _save_vehicles(new_rows)
    return jsonify({"ok": True})




@app.post("/api/import/sheet")
@login_required
def api_import_sheet():
    """Import vehicles from a Google Sheets link (CSV export).

    Requirements:
      - The sheet must be accessible (anyone with link can view OR published).
      - The first row is treated as headers.
      - Column order may differ; matching is by header text.

    Behavior:
      - Upsert by carNo (existing rows are updated).
      - Writes change log with action 'import'.
    """
    payload = request.get_json(silent=True) or {}
    raw_url = str(payload.get("url") or "").strip()
    if not raw_url:
        return jsonify({"ok": False, "error": "url is required"}), 400

    csv_url = _csv_export_url_from_any(raw_url)
    if not csv_url:
        return jsonify({"ok": False, "error": "unsupported url"}), 400

    try:
        with urllib.request.urlopen(csv_url) as resp:
            data = resp.read()
        text = data.decode("utf-8-sig", errors="replace")
    except Exception as e:
        return jsonify({"ok": False, "error": f"fetch failed: {e}"}), 400

    rows = _read_csv_rows(text)
    if not rows:
        return jsonify({"ok": False, "error": "no rows"}), 400

    vehicles = _load_vehicles()
    by_car = {str(v.get("carNo", "")).strip(): v for v in vehicles if str(v.get("carNo", "")).strip()}

    created = 0
    updated = 0
    skipped = 0
    errors: List[Dict[str, Any]] = []

    for r in rows:
        try:
            p = _sheet_row_to_payload(r)
            # Never trust ownership fields from sheet import.
            for _k in ("providerCode", "provider_code", "providerCompanyCode", "provider_company_code"):
                if _k in p:
                    p.pop(_k, None)
            car_no = str(p.get("carNo") or "").strip()
            if not car_no:
                skipped += 1
                continue

            # ownership / access control
            role = session.get("role")
            my_code = str(session.get("code") or "").strip()
            my_company = str(session.get("company_code") or "").strip()

            # business registration number column (for ADMIN import-on-behalf)
            biz_raw = str(p.get("businessNo") or p.get("business_no") or "").strip()
            biz_norm = _normalize_business_no(biz_raw) if biz_raw else ""
            # remove businessNo from vehicle payload
            if "businessNo" in p:
                p.pop("businessNo", None)
            if "business_no" in p:
                p.pop("business_no", None)

            if role == "ADMIN":
                if not biz_norm:
                    errors.append({"row": r, "error": "missing business_no (사업자등록번호) for ADMIN import"})
                    continue
                partner = _find_partner_by_business_no(biz_norm)
                if not partner:
                    errors.append({"row": r, "error": f"unknown business_no: {biz_norm}"})
                    continue
                if str(partner.get("partner_role") or "").upper() != "PROVIDER":
                    errors.append({"row": r, "error": f"business_no is not a PROVIDER partner: {biz_norm}"})
                    continue
                target_company = str(partner.get("company_code") or partner.get("partner_code") or "").strip()
                if not target_company:
                    errors.append({"row": r, "error": f"partner has no company_code for business_no: {biz_norm}"})
                    continue
                # If car exists and is owned by another provider company, block.
                if car_no in by_car:
                    existing_company = str(by_car[car_no].get("providerCompanyCode") or by_car[car_no].get("provider_company_code") or "").strip()
                    if existing_company and existing_company != target_company:
                        errors.append({"row": r, "error": f"forbidden: carNo belongs to another provider company ({existing_company})"})
                        continue
                p["providerCompanyCode"] = target_company

                # choose a default providerCode within that company (first ACTIVE provider user)
                try:
                    users = _load_users(USERS_JSON)
                    provs = [u for u in users if str(u.get("role") or "").upper() == "PROVIDER" and str(u.get("company_code") or "").strip() == target_company and str(u.get("status") or "ACTIVE").upper() == "ACTIVE"]
                    provs_sorted = sorted(provs, key=lambda u: str(u.get("code") or ""))
                    if provs_sorted:
                        p["providerCode"] = str(provs_sorted[0].get("code") or "").strip()
                except Exception:
                    pass

            if role == "PROVIDER":
                p["providerCompanyCode"] = my_company
            if role == "PROVIDER":
                # If the car exists but belongs to another provider, block import.
                if car_no in by_car:
                    owner = str(by_car[car_no].get("providerCode") or by_car[car_no].get("provider_code") or "").strip()
                    if owner and owner != my_code:
                        errors.append({"row": r, "error": f"forbidden: carNo belongs to another provider ({owner})"})
                        continue
                # For new cars (or missing owner), stamp ownership to current provider
                p["providerCode"] = my_code

            if car_no in by_car:
                old = by_car[car_no]
                doc = dict(old)
                # merge (carNo immutable)
                for k, v in p.items():
                    if k == "carNo":
                        continue
                    doc[k] = v
                doc = _normalize_vehicle_payload(doc, car_no)
                doc.setdefault("createdAt", old.get("createdAt") or _now_iso())
                doc["updatedAt"] = _now_iso()
                ch = _diff_fields(old, doc, list(p.keys()))
                if ch:
                    _append_change_log(doc, "import", ch)
                by_car[car_no] = doc
                updated += 1
            else:
                doc = _normalize_vehicle_payload(p, car_no)
                doc.setdefault("createdAt", _now_iso())
                _append_change_log(doc, "import")
                by_car[car_no] = doc
                created += 1
        except Exception as e:
            errors.append({"row": r, "error": str(e)})

    # save back
    merged = list(by_car.values())
    _save_vehicles(merged)

    return jsonify(
        {
            "ok": True,
            "created": created,
            "updated": updated,
            "skipped": skipped,
            "errors": errors[:20],
        }
    )


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=7000, debug=True)
