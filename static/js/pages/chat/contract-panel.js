/**
 * chat/contract-panel.js
 * 채팅 페이지 우측 계약정보 패널 — contract-manage.js 폼 로직 복제
 */
import { updateContract, deleteContract, fetchContractsOnce, getProduct } from '../../firebase/firebase-db.js';
import { uploadContractFilesDetailed, deleteProductImagesByUrls } from '../../firebase/firebase-storage.js';
import { showToast, showConfirm } from '../../core/toast.js';
import { escapeHtml } from '../../core/management-format.js';
import { createContractDocsController } from '../contract-manage/docs.js';
import { parseMoneyValue, ensureSelectValue, resolveTermPricing, deriveMakerDisplay, deriveModelDisplay, deriveSubModelDisplay, deriveTrimDisplay } from '../contract-manage/helpers.js';
import { maskName, maskBirth, maskPhone, encryptField, decryptField, requestDecryptPassword } from '../../core/crypto.js';
import { createManagedFormModeApplier } from '../../core/management-skeleton.js';

const AGENT_CHECK_KEYS = ['docs_attached', 'approval_requested'];
const PROVIDER_CHECK_KEYS = ['deposit_confirmed', 'progress_approved', 'contract_written', 'balance_confirmed', 'delivery_confirmed'];
const CHECK_FIELD_KEYS = [...AGENT_CHECK_KEYS, ...PROVIDER_CHECK_KEYS];

export function createChatContractPanel({ profile, user }) {
  const $ = (id) => document.getElementById(id);
  const panel = $('cc-panel');
  const title = $('cc-title');
  const form = $('cc-form');
  const body = $('cc-body');
  const submitBtn = $('cc-submit-btn');
  const deleteBtn = $('cc-delete-btn');
  const revealBtn = $('cc-reveal-btn');
  const messageEl = $('cc-message');

  const fields = {
    contract_status: $('cc-contract_status'),
    contract_code: $('cc-contract_code'),
    partner_code: $('cc-partner_code'),
    agent_code: $('cc-agent_code'),
    car_number: $('cc-car_number'),
    contract_maker: $('cc-contract_maker'),
    contract_model: $('cc-contract_model'),
    contract_sub_model: $('cc-contract_sub_model'),
    contract_trim: $('cc-contract_trim'),
    rent_month: $('cc-rent_month'),
    rent_amount: $('cc-rent_amount'),
    deposit_amount: $('cc-deposit_amount'),
    customer_name: $('cc-customer_name'),
    customer_birth: $('cc-customer_birth'),
    customer_phone: $('cc-customer_phone'),
    docs_attached: $('cc-docs_attached'),
    approval_requested: $('cc-approval_requested'),
    deposit_confirmed: $('cc-deposit_confirmed'),
    progress_approved: $('cc-progress_approved'),
    contract_written: $('cc-contract_written'),
    balance_confirmed: $('cc-balance_confirmed'),
    delivery_confirmed: $('cc-delivery_confirmed'),
  };

  const formMode = $('cc-form_mode');
  const codeHidden = $('cc-code_hidden');

  let currentContract = null;
  let mode = 'idle';
  let linkedProduct = null;

  // ── Docs Controller ──
  const docsController = createContractDocsController({
    input: $('cc-docs'),
    dropzone: $('cc-doc-dropzone'),
    list: $('cc-doc-list'),
    summary: $('cc-doc-summary'),
    clearButton: $('cc-doc-clear'),
    getMode: () => mode
  });

  // ── Form Mode ──
  const applyFormMode = createManagedFormModeApplier({
    form,
    panelLabel: '계약',
    getIdentity: () => currentContract?.contract_code || codeHidden?.value || '',
    isSelected: () => Boolean(codeHidden?.value || currentContract?.contract_code),
    submitButtons: [submitBtn],
    deleteButtons: [deleteBtn],
    defaultOptions: {
      alwaysReadOnlyIds: ['cc-contract_code', 'cc-partner_code', 'cc-agent_code', 'cc-car_number'],
      customDisable: (field, context) => {
        const key = Object.entries(fields).find(([, node]) => node === field)?.[0] || '';
        if (['contract_status', 'rent_month'].includes(key)) return context.isView;
        if (CHECK_FIELD_KEYS.includes(key)) return context.isView;
        return false;
      }
    }
  });

  function setMode(nextMode) {
    mode = nextMode;
    if (formMode) formMode.value = nextMode;
    const isIdle = nextMode === 'idle';
    const isCreate = nextMode === 'create';
    const canDelete = !isCreate && !isIdle && (profile?.role === 'provider' || profile?.role === 'admin');
    applyFormMode(nextMode, { deleteEnabled: canDelete });
    if (!isIdle) submitBtn.disabled = false;
    docsController.syncInteraction(nextMode !== 'view' && nextMode !== 'idle');
  }

  // ── Load linked product ──
  async function loadLinkedProduct(contract) {
    const key = contract.product_uid || contract.product_code || contract.seed_product_key || '';
    if (!key) { linkedProduct = null; return null; }
    try {
      linkedProduct = await getProduct(key);
      return linkedProduct;
    } catch { linkedProduct = null; return null; }
  }

  async function populateRentMonthOptions(contract = {}) {
    const select = fields.rent_month;
    if (!select) return;
    select.innerHTML = '<option value="">선택</option>';
    const product = await loadLinkedProduct(contract);
    if (!product) return;
    const months = [];
    if (product.price && typeof product.price === 'object') {
      Object.keys(product.price).forEach(k => { const m = Number(k); if (m > 0) months.push(m); });
    }
    Object.keys(product).forEach(k => {
      const match = k.match(/^(?:rent|rental_price|deposit)_(\d+)$/);
      if (match) { const m = Number(match[1]); if (m > 0 && !months.includes(m)) months.push(m); }
    });
    months.sort((a, b) => a - b).forEach(m => {
      const opt = document.createElement('option');
      opt.value = String(m);
      opt.textContent = `${m}개월`;
      select.appendChild(opt);
    });
  }

  // ── Fill Form ──
  async function fillForm(contract) {
    if (!contract) return;
    currentContract = contract;
    if (codeHidden) codeHidden.value = contract.contract_code || '';

    if (fields.contract_code) fields.contract_code.value = contract.contract_code || '';
    ensureSelectValue(fields.contract_status, contract.contract_status || '계약대기');
    if (fields.partner_code) fields.partner_code.value = contract.partner_code || contract.provider_company_code || '';
    if (fields.agent_code) fields.agent_code.value = contract.agent_code || '';
    if (fields.car_number) fields.car_number.value = contract.car_number || '';
    if (fields.contract_maker) fields.contract_maker.value = deriveMakerDisplay(contract);
    if (fields.contract_model) fields.contract_model.value = deriveModelDisplay(contract);
    if (fields.contract_sub_model) fields.contract_sub_model.value = deriveSubModelDisplay(contract);
    if (fields.contract_trim) fields.contract_trim.value = deriveTrimDisplay(contract);

    await populateRentMonthOptions(contract);
    ensureSelectValue(fields.rent_month, String(contract.rent_month || '').replace(/[^\d]/g, ''));

    if (fields.rent_amount) fields.rent_amount.value = contract.rent_amount ? Number(contract.rent_amount).toLocaleString('ko-KR') : '';
    if (fields.deposit_amount) fields.deposit_amount.value = contract.deposit_amount ? Number(contract.deposit_amount).toLocaleString('ko-KR') : '';

    if (fields.customer_name) fields.customer_name.value = contract.customer_name || '';
    if (fields.customer_birth) fields.customer_birth.value = contract.customer_birth || '';
    if (fields.customer_phone) fields.customer_phone.value = contract.customer_phone || '';

    const checks = contract.checks || {};
    CHECK_FIELD_KEYS.forEach(key => { if (fields[key]) fields[key].checked = !!checks[key]; });

    docsController.load(contract.docs || []);

    // idle hint / 생성버튼 숨기기
    const hint = body?.querySelector('.manage-idle-hint');
    if (hint) hint.style.display = 'none';
    body?.querySelector('.cc-create-wrap')?.remove();
    if (form) form.style.display = '';

    setMode('view');
    markIncompleteFields();
  }

  function markIncompleteFields() {
    CHECK_FIELD_KEYS.forEach(key => {
      const checkbox = fields[key];
      if (!checkbox) return;
      const item = checkbox.closest('.contract-check-item');
      if (item) item.classList.toggle('is-incomplete', !checkbox.checked);
    });
    ['rent_month', 'rent_amount', 'deposit_amount', 'customer_name', 'customer_birth', 'customer_phone'].forEach(key => {
      const el = fields[key];
      if (!el) return;
      const val = String(el.value || '').trim();
      el.classList.toggle('is-incomplete', !val || val === '0');
    });
  }

  function resetForm(room = null, { getCurrentProduct } = {}) {
    currentContract = null;
    if (codeHidden) codeHidden.value = '';
    docsController.reset();
    Object.values(fields).forEach(el => {
      if (!el) return;
      if (el.type === 'checkbox') el.checked = false;
      else el.value = '';
    });
    ensureSelectValue(fields.contract_status, '계약대기');
    if (form) form.style.display = 'none';
    if (title) title.textContent = '계약정보';

    const hint = body?.querySelector('.manage-idle-hint');
    // 기존 생성 버튼 제거
    body?.querySelector('.cc-create-wrap')?.remove();

    if (!room) {
      if (hint) hint.style.display = '';
      setMode('idle');
      return;
    }

    // room 선택되었지만 계약 없음 → 생성 버튼
    if (hint) hint.style.display = 'none';
    const canCreate = profile?.role === 'agent';
    const wrap = document.createElement('div');
    wrap.className = 'cc-create-wrap';
    wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;gap:20px;padding:32px;';
    wrap.innerHTML = `
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M12 12v6"/><path d="M9 15h6"/></svg>
      <div style="font-size:13px;color:var(--text-muted,#94a3b8);text-align:center;">이 대화에 연결된<br>계약이 없습니다.</div>
      ${canCreate ? `<button type="button" class="cc-create-btn" style="
        width:100%;padding:18px 0;border:none;border-radius:var(--radius-sm);
        background:var(--new-accent,#1b2a4a);color:#fff;font-size:16px;font-weight:700;
        cursor:pointer;transition:background 0.15s;letter-spacing:-0.02em;
      ">계약 생성하기</button>` : ''}
    `;
    body?.appendChild(wrap);

    wrap.querySelector('.cc-create-btn')?.addEventListener('click', () => {
      const product = typeof getCurrentProduct === 'function' ? getCurrentProduct() : null;
      const seed = {
        product_uid: room.product_uid || product?.productUid || product?.id || '',
        product_code: room.product_code || product?.productCode || '',
        partner_code: room.provider_company_code || product?.providerCompanyCode || '',
        car_number: room.vehicle_number || product?.carNo || '',
        model_name: room.model_name || product?.model || '',
        sub_model: product?.subModel || '',
        rent_month: '48',
        rent_amount: product?.price?.['48']?.rent || 0,
        deposit_amount: product?.price?.['48']?.deposit || 0
      };
      localStorage.setItem('freepass_pending_contract_seed', JSON.stringify(seed));
      window.location.href = '/contract';
    });

    setMode('idle');
  }

  // ── Save ──
  async function handleSave() {
    if (!currentContract) return;
    const editingCode = currentContract.contract_code;
    if (!editingCode) return;

    try {
      // 파일 처리
      const pendingFiles = docsController.getPendingDocFiles();
      let docs = docsController.getStoredDocs().map(d => ({ name: d.name, url: d.url, type: d.type }));
      if (pendingFiles.length) {
        const uploaded = await uploadContractFilesDetailed(pendingFiles, user?.uid || 'unknown', {
          onProgress: (i, total) => { if (messageEl) messageEl.textContent = `업로드 ${i}/${total}...`; }
        });
        docs = [...docs, ...uploaded.results.filter(r => r.success).map(r => ({ name: r.name, url: r.url, type: r.type || '' }))];
      }

      const selectedStatus = fields.contract_status?.value || '계약대기';
      const allDone = CHECK_FIELD_KEYS.every(k => !!fields[k]?.checked);

      const payload = {
        contract_status: allDone ? '계약완료' : selectedStatus,
        rent_month: String(fields.rent_month?.value || '').replace(/[^\d]/g, '') || '',
        rent_amount: parseMoneyValue(fields.rent_amount?.value),
        deposit_amount: parseMoneyValue(fields.deposit_amount?.value),
        customer_name: maskName(fields.customer_name?.value?.trim() || ''),
        customer_birth: maskBirth(fields.customer_birth?.value?.trim() || ''),
        customer_phone: maskPhone(fields.customer_phone?.value?.trim() || ''),
        checks: Object.fromEntries(CHECK_FIELD_KEYS.map(key => [key, !!fields[key]?.checked])),
        docs
      };

      // 암호화
      const rawName = fields.customer_name?.value?.trim();
      const rawBirth = fields.customer_birth?.value?.trim();
      const rawPhone = fields.customer_phone?.value?.trim();
      if (rawName || rawBirth || rawPhone) {
        try {
          const pw = await requestDecryptPassword();
          if (pw) {
            payload._secure = {};
            if (rawName) payload._secure.customer_name = await encryptField(rawName, pw);
            if (rawBirth) payload._secure.customer_birth = await encryptField(rawBirth, pw);
            if (rawPhone) payload._secure.customer_phone = await encryptField(rawPhone, pw);
          }
        } catch { /* 암호화 실패 시 마스킹만 저장 */ }
      }

      await updateContract(editingCode, payload);
      showToast('계약 정보를 저장했습니다.', 'success');

      // 저장 후 최신 데이터로 리필
      const contracts = await fetchContractsOnce();
      const updated = contracts.find(c => c.contract_code === editingCode);
      if (updated) {
        docsController.load(updated.docs || []);
        await fillForm(updated);
      }
      if (messageEl) messageEl.textContent = '';
    } catch (err) {
      showToast('저장 실패: ' + (err.message || err), 'error');
    }
  }

  // ── Delete ──
  async function handleDelete() {
    if (!currentContract) return;
    const editingCode = currentContract.contract_code;
    if (!editingCode) return;
    if (currentContract.contract_status === '계약완료') {
      showToast('계약완료 상태에서는 삭제할 수 없습니다.', 'error');
      return;
    }
    if (!await showConfirm(`계약 ${editingCode} 를 삭제할까요?`)) return;
    try {
      await deleteContract(editingCode);
      showToast('삭제 완료', 'success');
      resetForm();
    } catch (err) {
      showToast('삭제 실패: ' + (err.message || err), 'error');
    }
  }

  // ── Personal Info Reveal ──
  revealBtn?.addEventListener('click', async () => {
    if (!currentContract?._secure) { showToast('암호화된 개인정보가 없습니다.', 'info'); return; }
    try {
      const pw = await requestDecryptPassword();
      if (!pw) return;
      const secure = currentContract._secure;
      const name = secure.customer_name ? await decryptField(secure.customer_name, pw) : '';
      const birth = secure.customer_birth ? await decryptField(secure.customer_birth, pw) : '';
      const phone = secure.customer_phone ? await decryptField(secure.customer_phone, pw) : '';
      if (name && fields.customer_name) fields.customer_name.value = name;
      if (birth && fields.customer_birth) fields.customer_birth.value = birth;
      if (phone && fields.customer_phone) fields.customer_phone.value = phone;
      showToast('개인정보가 표시됩니다. 30초 후 자동 마스킹됩니다.', 'info');
      setTimeout(() => {
        if (currentContract) {
          if (fields.customer_name) fields.customer_name.value = currentContract.customer_name || '';
          if (fields.customer_birth) fields.customer_birth.value = currentContract.customer_birth || '';
          if (fields.customer_phone) fields.customer_phone.value = currentContract.customer_phone || '';
        }
      }, 30000);
    } catch (err) {
      showToast('복호화 실패: ' + (err.message || err), 'error');
    }
  });

  // ── Rent Month Change ──
  fields.rent_month?.addEventListener('change', () => {
    const month = String(fields.rent_month.value || '').replace(/[^\d]/g, '');
    if (!month || !linkedProduct) return;
    const pricing = resolveTermPricing(linkedProduct, month);
    if (!pricing) return;
    if (fields.rent_amount) fields.rent_amount.value = pricing.rent ? pricing.rent.toLocaleString('ko-KR') : '';
    if (fields.deposit_amount) fields.deposit_amount.value = pricing.deposit ? pricing.deposit.toLocaleString('ko-KR') : '';
  });

  // ── File Events ──
  const docInput = $('cc-docs');
  const docDropzone = $('cc-doc-dropzone');
  const docClearBtn = $('cc-doc-clear');

  docInput?.addEventListener('change', () => { docsController.appendFiles(docInput.files); });
  docDropzone?.addEventListener('dragover', (e) => { e.preventDefault(); docDropzone.classList.add('is-dragover'); });
  docDropzone?.addEventListener('dragleave', () => { docDropzone.classList.remove('is-dragover'); });
  docDropzone?.addEventListener('drop', (e) => { e.preventDefault(); docDropzone.classList.remove('is-dragover'); docsController.appendFiles(e.dataTransfer?.files); });
  docClearBtn?.addEventListener('click', () => { docsController.clearAll(); });

  // ── Button Events ──
  submitBtn?.addEventListener('click', () => {
    if (mode === 'view') { setMode('edit'); return; }
    if (mode === 'edit') handleSave();
  });
  deleteBtn?.addEventListener('click', handleDelete);

  // ── Public API ──
  return {
    fillForm,
    resetForm,
    getCurrentContract: () => currentContract,
    destroy: () => { docsController.destroy(); }
  };
}
