/**
 * Cloud Functions — 알림 발송
 *
 * 트리거 3개:
 *   1) /messages/{roomId}/{msgId} onCreate → FCM 푸시 (수신자 전원)
 *   2) /rooms/{roomId}           onCreate → SMS (공급사측 — 새 문의)
 *   3) /contracts/{code}         onCreate → SMS (공급사 + 영업자 — 새 계약)
 *
 * SMS는 agent / provider / agent_manager 만 (admin 제외)
 */

const { onValueCreated } = require('firebase-functions/v2/database');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const crypto = require('crypto');

admin.initializeApp();

const REGION = 'asia-southeast1';
const DB_INSTANCE = 'freepasserp3-default-rtdb';

// ─── Solapi ───────────────────────────────────────────────────────────────
const SOLAPI_KEY = 'NCSV5JTOZ121DIDR';
const SOLAPI_SECRET = 'EHWRARRBCD9UYQ3HFBM8XINKZD8BHNE0';
const SOLAPI_FROM = '01063930926';

function solapiAuthHeader() {
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(16).toString('hex');
  const sig = crypto
    .createHmac('sha256', SOLAPI_SECRET)
    .update(date + salt)
    .digest('hex');
  return `HMAC-SHA256 apiKey=${SOLAPI_KEY}, date=${date}, salt=${salt}, signature=${sig}`;
}

async function sendSms(to, text) {
  const cleanTo = String(to || '').replace(/-/g, '').trim();
  if (!cleanTo || !text) return { ok: false, reason: 'missing' };
  const res = await fetch('https://api.solapi.com/messages/v4/send', {
    method: 'POST',
    headers: {
      Authorization: solapiAuthHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message: { to: cleanTo, from: SOLAPI_FROM, text } }),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, result: json };
}

async function sendSmsBulk(targets, text) {
  // targets: [{ uid, phone, role, name }]
  const seenPhones = new Set();
  for (const t of targets) {
    const phone = String(t.phone || '').replace(/-/g, '').trim();
    if (!phone || seenPhones.has(phone)) continue;
    seenPhones.add(phone);
    try {
      const r = await sendSms(phone, text);
      if (r.ok) {
        logger.info('[SMS] 성공', { role: t.role, mask: phone.slice(0, 4) + '****' });
      } else {
        logger.warn('[SMS] 실패', { role: t.role, status: r.status, result: r.result });
      }
    } catch (e) {
      logger.error('[SMS] 예외', { err: e.message });
    }
  }
}

// ─── 사용자 조회 헬퍼 ────────────────────────────────────────────────────
async function getUsers() {
  const snap = await admin.database().ref('users').once('value');
  return snap.val() || {};
}

// SMS 수신 동의 확인 — settings.sms_enabled !== false 이면 기본 켜짐
function smsEnabled(u) {
  return !(u && u.settings && u.settings.sms_enabled === false);
}

function findProviderUsers(users, providerCompanyCode, excludeUid) {
  if (!providerCompanyCode) return [];
  return Object.entries(users)
    .filter(([uid, u]) =>
      u && uid !== excludeUid &&
      u.role === 'provider' &&
      u.status === 'active' &&
      u.company_code === providerCompanyCode &&
      smsEnabled(u)
    )
    .map(([uid, u]) => ({ uid, role: u.role, name: u.name || '', phone: u.phone || '' }));
}

function findAgentUser(users, { agentUid, agentCode }, excludeUid) {
  return Object.entries(users)
    .filter(([uid, u]) =>
      u && uid !== excludeUid &&
      u.role === 'agent' &&
      u.status === 'active' &&
      (uid === agentUid || (agentCode && u.user_code === agentCode)) &&
      smsEnabled(u)
    )
    .map(([uid, u]) => ({ uid, role: u.role, name: u.name || '', phone: u.phone || '' }));
}

function findAgentManagerUsers(users, agentChannelCode, excludeUid) {
  if (!agentChannelCode) return [];
  return Object.entries(users)
    .filter(([uid, u]) =>
      u && uid !== excludeUid &&
      u.role === 'agent_manager' &&
      u.status === 'active' &&
      u.company_code === agentChannelCode &&
      smsEnabled(u)
    )
    .map(([uid, u]) => ({ uid, role: u.role, name: u.name || '', phone: u.phone || '' }));
}

// 모든 활성 admin (모니터링 목적 — 초기 운영 단계에서 admin도 SMS 받음)
function findAdminUsers(users, excludeUid) {
  return Object.entries(users)
    .filter(([uid, u]) =>
      u && uid !== excludeUid &&
      u.role === 'admin' &&
      smsEnabled(u) &&
      u.phone
    )
    .map(([uid, u]) => ({ uid, role: u.role, name: u.name || '', phone: u.phone || '' }));
}

// ─── 1) 새 채팅 메시지 → FCM 푸시 ────────────────────────────────────────
exports.pushOnNewMessage = onValueCreated(
  {
    ref: '/messages/{roomId}/{msgId}',
    instance: DB_INSTANCE,
    region: REGION,
  },
  async (event) => {
    const msg = event.data.val() || {};
    const { roomId, msgId } = event.params;
    const senderUid = msg.sender_uid || msg.senderUid || '';

    const [roomSnap, users] = await Promise.all([
      admin.database().ref(`rooms/${roomId}`).once('value'),
      getUsers(),
    ]);
    const room = roomSnap.val() || {};

    // 수신자 (방 참여자 — 발신자 제외)
    const recipients = [];
    for (const [uid, u] of Object.entries(users)) {
      if (!u || uid === senderUid) continue;
      if (u.role !== 'admin' && u.status && u.status !== 'active') continue;
      const isAdmin = u.role === 'admin';
      const isAgent = u.role === 'agent' && (uid === room.agent_uid || u.user_code === room.agent_code);
      const isProvider = u.role === 'provider' && u.company_code && u.company_code === room.provider_company_code;
      const isAM = u.role === 'agent_manager' && u.company_code && u.company_code === room.agent_channel_code;
      if (isAdmin || isAgent || isProvider || isAM) {
        recipients.push({ uid, role: u.role });
      }
    }
    if (!recipients.length) return;

    // 토큰 수집
    const tokens = [];
    const tokenToUid = new Map();
    for (const r of recipients) {
      const tokSnap = await admin.database().ref(`fcm_tokens/${r.uid}`).once('value');
      const tokMap = tokSnap.val() || {};
      for (const t of Object.keys(tokMap)) {
        tokens.push(t);
        tokenToUid.set(t, r.uid);
      }
    }
    if (!tokens.length) return;

    const senderLabel =
      msg.sender_role === 'agent'
        ? `영업 ${room.agent_code || ''}`.trim()
        : msg.sender_role === 'provider'
          ? `공급 ${room.provider_company_code || ''}`.trim()
          : '관리자';
    const carNo = room.vehicle_number || room.car_number || '';
    const titlePrefix = carNo ? `[${senderLabel} · ${carNo}]` : `[${senderLabel}]`;
    const bodyText = String(msg.text || msg.body || '').slice(0, 100);

    try {
      const fcmRes = await admin.messaging().sendEachForMulticast({
        tokens,
        notification: { title: `${titlePrefix} 새 메시지`, body: bodyText || '(내용 없음)' },
        data: {
          type: 'chat',
          room_id: String(roomId),
          msg_id: String(msgId),
          link: `/chat?room_id=${encodeURIComponent(roomId)}`,
        },
        webpush: {
          fcmOptions: { link: `/chat?room_id=${encodeURIComponent(roomId)}` },
          notification: {
            icon: '/static/apple-touch-icon-180.png',
            badge: '/static/favicon.ico',
            tag: `chat-${roomId}`,
            renotify: true,
          },
        },
      });
      logger.info('[FCM] 메시지 푸시', {
        recipients: recipients.length,
        tokens: tokens.length,
        success: fcmRes.successCount,
        failure: fcmRes.failureCount,
      });
      // 만료 토큰 정리
      const invalid = [];
      fcmRes.responses.forEach((r, i) => {
        const code = r.error?.code || '';
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token' ||
          code === 'messaging/invalid-argument'
        ) invalid.push(tokens[i]);
      });
      if (invalid.length) {
        const updates = {};
        for (const t of invalid) {
          const uid = tokenToUid.get(t);
          if (uid) updates[`fcm_tokens/${uid}/${t}`] = null;
        }
        await admin.database().ref().update(updates);
      }
    } catch (e) {
      logger.error('[FCM] 발송 실패', e);
    }
  }
);

// ─── 2) 새 문의 (rooms 생성) → 공급사에게 SMS ───────────────────────────
exports.smsOnNewRoom = onValueCreated(
  {
    ref: '/rooms/{roomId}',
    instance: DB_INSTANCE,
    region: REGION,
  },
  async (event) => {
    const room = event.data.val() || {};
    const { roomId } = event.params;
    const providerCode = room.provider_company_code || room.partner_code || '';
    const agentCode = room.agent_code || '';
    const carNumber = room.vehicle_number || room.car_number || '';

    if (!providerCode) {
      logger.info('[SMS] 신규문의 — provider_company_code 없음', { roomId });
      return;
    }

    const users = await getUsers();
    const providers = findProviderUsers(users, providerCode, room.agent_uid || '');
    const admins = findAdminUsers(users, room.agent_uid || '');
    const targets = [...providers, ...admins];

    if (!targets.length) {
      logger.info('[SMS] 신규문의 — 대상자 없음', { providerCode });
      return;
    }

    const text = [
      `[프리패스] 신규 문의가 도착했습니다.`,
      carNumber ? `차량: ${carNumber}` : '',
      agentCode ? `영업자: ${agentCode}` : '',
      `ERP에서 확인해주세요.`,
    ].filter(Boolean).join('\n');

    await sendSmsBulk(targets, text);
  }
);

// ─── 3) 새 계약 생성 → 공급사 + 영업자에게 SMS ──────────────────────────
exports.smsOnNewContract = onValueCreated(
  {
    ref: '/contracts/{code}',
    instance: DB_INSTANCE,
    region: REGION,
  },
  async (event) => {
    const contract = event.data.val() || {};
    const { code } = event.params;

    // soft-delete로 생성되는 경우 방지
    if (contract.status === 'deleted' || contract.contract_status === '삭제됨') return;

    const providerCode = contract.partner_code || contract.provider_company_code || '';
    const agentCode = contract.agent_code || '';
    const agentUid = contract.agent_uid || '';
    const agentChannelCode = contract.agent_channel_code || contract.channel_code || '';
    const carNumber = contract.car_number || contract.vehicle_number || '';
    const customerName = contract.customer_name || '';
    const model = [contract.contract_maker, contract.contract_model].filter(Boolean).join(' ');
    const createdByUid = contract.created_by || '';

    const users = await getUsers();
    const providers = findProviderUsers(users, providerCode, createdByUid);
    const agents = findAgentUser(users, { agentUid, agentCode }, createdByUid);
    const managers = findAgentManagerUsers(users, agentChannelCode, createdByUid);
    const admins = findAdminUsers(users, createdByUid);

    const targets = [...providers, ...agents, ...managers, ...admins];
    if (!targets.length) {
      logger.info('[SMS] 신규계약 — 대상자 없음', { code, providerCode, agentCode });
      return;
    }

    const text = [
      `[프리패스] 신규 계약이 접수되었습니다.`,
      `계약: ${code}`,
      carNumber ? `차량: ${carNumber}` : '',
      model ? `모델: ${model}` : '',
      customerName ? `고객: ${customerName}` : '',
      `ERP에서 확인해주세요.`,
    ].filter(Boolean).join('\n');

    await sendSmsBulk(targets, text);
  }
);
