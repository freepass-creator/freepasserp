(function(){
  // Approvals page: 회원 승인 (local MVP)
  window.FP_PAGES = window.FP_PAGES || {};

  window.FP_PAGES.approvals = async function(ctx){
    const { $, esc } = ctx;
    const FMT = (window.FP_CORE || {});

    const elArchive = $("#approvals-archive");
    const elPending = $("#approvals-pending");
    const elDetail  = $("#approvals-detail");

    const elArchiveCount = $("#approvals-archive-count");
    const elPendingTitle = $("#approvals-pending-title");
    const elCenterTitle  = $("#approvals-center-title");
    const btnOpenPartner = $("#btn-open-partner");

    if(!elArchive || !elPending || !elDetail) return;

    const ROLE_LABEL = { "ADMIN":"관리자", "AGENT":"영업자", "PROVIDER":"공급사" };
    const STATUS_LABEL = { "ACTIVE":"승인", "REJECTED":"반려", "PENDING":"대기" };

    function toDateTime(v){
      const d = (FMT.fmtDateYYMMDD ? FMT.fmtDateYYMMDD(v) : "");
      const t = (FMT.fmtTimeHHMM ? FMT.fmtTimeHHMM(v) : "");
      return { d, t };
    }

    async function fetchJson(url){
      const res = await fetch(url, { credentials: "same-origin" });
      if(!res.ok) throw new Error("fetch_failed");
      const rows = await res.json();
      return Array.isArray(rows) ? rows : [];
    }

    async function savePartner(payload){
      const res = await fetch(`/api/admin/partners`, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        credentials:"same-origin",
        body: JSON.stringify(payload || {})
      });
      const out = await res.json().catch(()=>({}));
      if(!res.ok) throw new Error(out.error || "partner_save_failed");
      return out;
    }

    async function approve(code, payload){
      const res = await fetch(`/api/admin/pending-users/${encodeURIComponent(code)}/approve`, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        credentials:"same-origin",
        body: JSON.stringify(payload || {})
      });
      if(!res.ok) throw new Error("approve_failed");
      return await res.json();
    }

    async function reject(code, reason){
      const res = await fetch(`/api/admin/pending-users/${encodeURIComponent(code)}/reject`, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        credentials:"same-origin",
        body: JSON.stringify({ reason: reason || "" })
      });
      if(!res.ok) throw new Error("reject_failed");
      return await res.json();
    }

    async function reopen(code){
      const res = await fetch(`/api/admin/rejected-users/${encodeURIComponent(code)}/reopen`, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        credentials:"same-origin",
        body: JSON.stringify({})
      });
      if(!res.ok) throw new Error("reopen_failed");
      return await res.json();
    }

    async function activeToPending(code){
      const res = await fetch(`/api/admin/active-users/${encodeURIComponent(code)}/to-pending`, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        credentials:"same-origin",
        body: JSON.stringify({})
      });
      if(!res.ok) throw new Error("to_pending_failed");
      return await res.json();
    }

    async function activeReject(code, reason){
      const res = await fetch(`/api/admin/active-users/${encodeURIComponent(code)}/reject`, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        credentials:"same-origin",
        body: JSON.stringify({ reason: reason || "" })
      });
      if(!res.ok) throw new Error("active_reject_failed");
      return await res.json();
    }

    let pending = [];
    let partners = [];
    let archive = []; // ACTIVE + REJECTED + PARTNER
    let selected = { bucket: null, code: null }; // bucket: pending|archive
    let centerMode = "DETAIL"; // DETAIL | PARTNER_NEW | PARTNER_EDIT

    function normalizeUser(u){
      const nu = Object.assign({}, u || {});
      nu.code = String(nu.code || "");
      nu.email = nu.email || "";
      nu.name = nu.name || "";
      nu.role = nu.role || "";
      nu.role_requested = nu.role_requested || "";
      nu.business_no = nu.business_no || "";
      nu.partner_code = nu.partner_code || "";
      nu.partner_company_name = nu.partner_company_name || "";
      nu.phone = nu.phone || "";
      nu.name_title = nu.name_title || nu.nameTitle || "";
      nu.workplace = nu.workplace || "";
      nu.fax = nu.fax || "";
      nu.company_code = nu.company_code || "";
      nu.status = nu.status || "";
      return nu;
    }

    function normalizePartner(p){
      const np = Object.assign({}, p || {});
      np.entityType = "PARTNER";
      np.partner_code = String(np.partner_code || np.partnerCode || "");
      np.business_no = np.business_no || np.businessNo || "";
      np.company_name = np.company_name || np.companyName || "";
      np.ceo_name = np.ceo_name || np.ceoName || "";
      np.address = np.address || "";
      np.manager_phone = np.manager_phone || np.managerPhone || "";
      np.tax_email = np.tax_email || np.taxEmail || "";
      np.status = np.status || "ACTIVE";
      np.created_at = np.created_at || np.createdAt || "";
      np.updated_at = np.updated_at || np.updatedAt || "";
      return np;
    }

    function findSelected(){
      if(!selected.code) return null;
      if(selected.bucket === "pending"){
        return pending.find(x => String(x.code||"") === String(selected.code));
      }
      if(selected.bucket === "archive"){
        return archive.find(x => String(x.code||"") === String(selected.code));
      }
      return null;
    }

    function renderPending(){
      if(elPendingTitle) elPendingTitle.textContent = `승인대기 ${pending.length}건`;
      elPending.innerHTML = pending.map(u=>{
        const active = (selected.bucket==="pending" && u.code===selected.code) ? "active" : "";
        const dt = toDateTime(u.created_at);
        const bizNo = (u.business_no || u.businessNo || "-");
        const email = (u.email || "-");
        const right = `${dt.d || ''} ${dt.t || ''}`.trim();

        const rr = (u.role_requested || u.role || "").toUpperCase();
        const reqRoleLabel = ROLE_LABEL[rr] || (rr ? rr : "-");

        const subParts = [];
        if(u.name_title || u.nameTitle || u.name) subParts.push(String(u.name_title || u.nameTitle || u.name));
        if(u.phone) subParts.push(String(u.phone));
        if(u.workplace) subParts.push(String(u.workplace));
        if(u.fax) subParts.push(String(u.fax));
        const sub = subParts.join(" | ");
        return `
          <div class="row ${active}" data-bucket="pending" data-code="${esc(u.code)}">
            <div class="main-line">
              <div class="main-left">
                <div class="badges">
                  <span class="badge">대기</span>
                  <span class="badge muted">${esc(reqRoleLabel)}</span>
                </div>
                <div class="main-text">${esc(bizNo)} ${esc(email)} ${esc(u.code||'-')}</div>
              </div>
              <div class="right-text">${esc(right)}</div>
            </div>
            <div class="sub-line">${esc(sub)}</div>
          </div>
        `;
      }).join("") || `<div class="center-muted">승인 대기 계정이 없습니다.</div>`;
    }

    async function reloadAll(keepSelection){
      const [p, a, r, ps] = await Promise.all([
        fetchJson("/api/admin/pending-users"),
        fetchJson("/api/admin/active-users"),
        fetchJson("/api/admin/rejected-users"),
        fetchJson("/api/admin/partners"),
      ]);

      pending = (p || []).map(normalizeUser);
      partners = (ps || []).map(normalizePartner);

      const active = (a || []).map(x => normalizeUser(Object.assign({ status: "ACTIVE" }, x)));
      const rejected = (r || []).map(normalizeUser);

      // 파트너는 '처리완료'에 로그처럼 같이 표시(요구사항)
      const partnerArchive = partners.map(pp => Object.assign({}, pp, {
        code: pp.partner_code,
        status: "PARTNER"
      }));

      archive = partnerArchive.concat(active).concat(rejected);

      // 선택 유지 (가능한 경우)
      if(keepSelection && selected && selected.code){
        const exists = findSelected();
        if(!exists){
          selected = { bucket: null, code: null };
        }
      }

      renderArchive();
      renderPending();

      // 선택된 항목이 있으면 상세도 갱신
      if(keepSelection && selected && selected.code){
        const u = findSelected();
        if(u){
          renderUserDetail(u, selected.bucket);
        }else{
          elDetail.innerHTML = `<div class="center-muted">항목을 선택하세요.</div>`;
        }
      }else{
        elDetail.innerHTML = `<div class="center-muted">항목을 선택하세요.</div>`;
      }
    }


    function renderArchive(){
      if(elArchiveCount) elArchiveCount.textContent = "";
      elArchive.innerHTML = archive.map(u=>{
        const active = (selected.bucket==="archive" && u.code===selected.code) ? "active" : "";

        // Partner entry
        if(u.entityType === "PARTNER"){
          const when = (u.updated_at || u.created_at || "");
          const dt = toDateTime(when);
          const right = `${dt.d || ""} ${dt.t || ""}`.trim();

          const subParts = [];
          if(u.ceo_name) subParts.push(String(u.ceo_name));
          if(u.manager_phone) subParts.push(String(u.manager_phone));
          if(u.tax_email) subParts.push(String(u.tax_email));
          if(u.address) subParts.push(String(u.address));
          const sub = subParts.join(" | ");

          return `
            <div class="row ${active}" data-bucket="archive" data-code="${esc(u.code)}">
              <div class="main-line">
                <div class="main-left">
                  <div class="badges">
                    <span class="badge dark">등록</span>
                    <span class="badge">파트너</span>
                  </div>
                  <div class="main-text">${esc(u.business_no||'-')} ${esc(u.company_name||'-')} ${esc(u.partner_code||'-')}</div>
                </div>
                <div class="right-text">${esc(right)}</div>
              </div>
              <div class="sub-line">${esc(sub)}</div>
            </div>
          `;
        }

        const when = (u.status === "REJECTED") ? (u.rejected_at || u.created_at) : (u.approved_at || u.created_at);
        const dt = toDateTime(when);
        const bizNo = (u.business_no || u.businessNo || "-");
        const email = (u.email || "-");
        const right = `${dt.d || ""} ${dt.t || ""}`.trim();

        const statusLabel = STATUS_LABEL[u.status] || u.status || "-";
        const roleLabel = ROLE_LABEL[u.role] || u.role || "-";
        const statusClass = (u.status === "ACTIVE") ? "dark" : (u.status === "REJECTED" ? "muted" : "");

        const subParts = [];
        if(u.name_title || u.nameTitle || u.name) subParts.push(String(u.name_title || u.nameTitle || u.name));
        if(u.phone) subParts.push(String(u.phone));
        if(u.workplace) subParts.push(String(u.workplace));
        if(u.fax) subParts.push(String(u.fax));
        const sub = subParts.join(" | ");
        return `
          <div class="row ${active}" data-bucket="archive" data-code="${esc(u.code)}">
            <div class="main-line">
              <div class="main-left">
                <div class="badges">
                  <span class="badge ${esc(statusClass)}">${esc(statusLabel)}</span>
                  <span class="badge">${esc(roleLabel)}</span>
                </div>
                <div class="main-text">${esc(bizNo)} ${esc(email)} ${esc(u.code||'-')}</div>
              </div>
              <div class="right-text">${esc(right)}</div>
            </div>
            <div class="sub-line">${esc(sub)}</div>
          </div>
        `;
      }).join("") || `<div class="center-muted">처리 완료 항목이 없습니다.</div>`;
    }

    function renderDetail(){
      if(elCenterTitle && centerMode === "DETAIL") elCenterTitle.textContent = "승인 처리";
      const u = findSelected();
      if(centerMode === "PARTNER_NEW" || centerMode === "PARTNER_EDIT"){
        renderPartnerForm(u && u.entityType==="PARTNER" ? u : null);
        return;
      }

      if(!u){
        elDetail.innerHTML = `<div class="center-muted">항목을 선택하세요.</div>`;
        return;
      }

      // Partner detail
      if(u.entityType === "PARTNER"){
        const dt = toDateTime(u.updated_at || u.created_at);
        const decided = `${dt.d||""} ${dt.t||""}`.trim();
        elDetail.innerHTML = `
          <div>
            <div class="kv-table">
              <div class="kv-tr"><div class="kv-th">상태</div><div class="kv-td">등록완료</div></div>
              <div class="kv-tr"><div class="kv-th">소속회사</div><div class="kv-td">${esc((u.company_name||"-") + " | " + (u.business_no||"-"))}</div></div>
              <div class="kv-tr"><div class="kv-th">소속구분</div><div class="kv-td">소속활동</div></div>
              <div class="kv-tr"><div class="kv-th">부여코드</div><div class="kv-td">${esc(u.partner_code||"-")}</div></div>
              <div class="kv-tr"><div class="kv-th">대표자명(선택)</div><div class="kv-td">${esc(u.ceo_name||"-")}</div></div>
              <div class="kv-tr"><div class="kv-th">담당자연락처(선택)</div><div class="kv-td">${esc(u.manager_phone||"-")}</div></div>
              <div class="kv-tr"><div class="kv-th">이메일(세금계산서)</div><div class="kv-td">${esc(u.tax_email||"-")}</div></div>
              <div class="kv-tr"><div class="kv-th">소재지(선택)</div><div class="kv-td">${esc(u.address||"-")}</div></div>
              <div class="kv-tr"><div class="kv-th">처리일자</div><div class="kv-td">${esc(decided||"-")}</div></div>
            </div>
          </div>
        `;
        return;
      }

      const baseDt = toDateTime(u.created_at);
      const roleLabel = ROLE_LABEL[u.role] || u.role || "-";

      const status = u.status || (selected.bucket==="pending" ? "PENDING" : "");
      const statusLabel = STATUS_LABEL[status] || status || "-";

      const decidedAt = (status==="ACTIVE") ? (u.approved_at || "") : (status==="REJECTED" ? (u.rejected_at || "") : "");
      const decidedDt = toDateTime(decidedAt);

      const title = (status==="PENDING") ? "승인 처리" : (status==="ACTIVE" ? "승인 처리" : (status==="REJECTED" ? "승인 처리" : "승인 처리"));

      let actionsHtml = "";
      if(status === "PENDING"){
        actionsHtml = `

          <div class="kv-section">
            <div class="sec-title">승인 처리</div>
            <div class="kv-table">
              <div class="kv-tr">
                <div class="kv-th">승인 역할</div>
                <div class="kv-td">
                  <div class="role-row" id="approve-role-row">
                    <label class="role-btn" data-role="AGENT"><input type="radio" name="roleFinal" value="AGENT"><span>영업자</span></label>
                    <label class="role-btn" data-role="PROVIDER"><input type="radio" name="roleFinal" value="PROVIDER"><span>공급사</span></label>
                  </div>
                  <div class="muted" style="margin-top:6px;">가입유형은 관리자 승인 시 지정됩니다.</div>
                </div>
              </div>
              <div class="kv-tr">
                <div class="kv-th">반려사유</div>
                <div class="kv-td"><textarea id="reject-reason" class="input" rows="3" placeholder="(선택)"></textarea></div>
              </div>
            </div>
            <div class="actions-row">
              <button class="btn" id="btn-approve" style="flex:1;">승인</button>
              <button class="btn secondary" id="btn-reject" style="flex:0 0 auto;">반려</button>
            </div>
          </div>

        `;
      }else if(status === "REJECTED"){
        actionsHtml = `
          <div class="kv-section">
            <div class="sec-title">후속 처리</div>
            <div class="kv-table">
              <div class="kv-tr"><div class="kv-th">반려사유</div><div class="kv-td">${esc(u.rejected_reason || "-")}</div></div>
            </div>
            <div class="actions-row">
              <button class="btn" id="btn-reopen" style="flex:1;">재심사(대기로)</button>
            </div>
          </div>
        `;
      }else if(status === "ACTIVE"){
        actionsHtml = `
          <div class="kv-section">
            <div class="sec-title">후속 처리</div>
            <div class="kv-table">
              <div class="kv-tr">
                <div class="kv-th">반려사유</div>
                <div class="kv-td"><textarea id="active-reject-reason" class="input" rows="3" placeholder="(선택)"></textarea></div>
              </div>
            </div>
            <div class="actions-row">
              <button class="btn secondary" id="btn-to-pending" style="flex:1;">대기상태로</button>
              <button class="btn" id="btn-active-reject" style="flex:0 0 auto;">반려로</button>
            </div>
          </div>
        `;
      }else{
        actionsHtml = ``;
      }

      const reqRole = (u.role_requested || "").toUpperCase();
      const reqRoleLabel = ROLE_LABEL[reqRole] || (reqRole ? reqRole : "-");

      const bizNo = (u.business_no || u.businessNo || "-");
      const joined = ((baseDt.d||"") + (baseDt.t?(" "+baseDt.t):""));
      const decided = decidedAt ? ((decidedDt.d||"") + (decidedDt.t?(" "+decidedDt.t):"")) : "";

      elDetail.innerHTML = `
        <div>
          <div class="kv-table">
            <div class="kv-tr"><div class="kv-th">상태</div><div class="kv-td">${esc(statusLabel)}</div></div>
            <div class="kv-tr"><div class="kv-th">소속회사</div><div class="kv-td">${esc((u.partner_company_name||"-") + " | " + (bizNo||"-"))}</div></div>
            <div class="kv-tr"><div class="kv-th">소속구분</div><div class="kv-td">${esc(u.partner_code || "-")}</div></div>
            <div class="kv-tr"><div class="kv-th">아이디</div><div class="kv-td">${esc(u.email||"-")}</div></div>
            <div class="kv-tr"><div class="kv-th">부여코드</div><div class="kv-td">${esc(u.code||"-")}</div></div>
            <div class="kv-tr"><div class="kv-th">이름/직책(선택)</div><div class="kv-td">${esc(u.name_title || u.nameTitle || u.name || "-")}</div></div>
            <div class="kv-tr"><div class="kv-th">연락처(선택)</div><div class="kv-td">${esc(u.phone || "-")}</div></div>
            <div class="kv-tr"><div class="kv-th">이메일(선택)</div><div class="kv-td">${esc(u.email||"-")}</div></div>
            <div class="kv-tr"><div class="kv-th">근무지주소(선택)</div><div class="kv-td">${esc(u.workplace || "-")}</div></div>
            <div class="kv-tr"><div class="kv-th">팩스(선택)</div><div class="kv-td">${esc(u.fax || "-")}</div></div>
            <div class="kv-tr"><div class="kv-th">활동구분</div><div class="kv-td">${esc(roleLabel)}</div></div>
            <div class="kv-tr"><div class="kv-th">가입일자</div><div class="kv-td">${esc(joined || "-")}</div></div>
            ${decidedAt ? `<div class="kv-tr"><div class="kv-th">처리일자</div><div class="kv-td">${esc(decided || "-")}</div></div>` : ``}
          </div>

          <div class="center-muted" id="approval-msg" style="margin-top:10px; display:none;"></div>
          ${actionsHtml}
        </div>
      `;

      const msg = document.getElementById("approval-msg");

      

      // bind actions
      const btnA = document.getElementById("btn-approve");
      const btnR = document.getElementById("btn-reject");
      const btnRe = document.getElementById("btn-reopen");
      const btnToP = document.getElementById("btn-to-pending");
      const btnARj = document.getElementById("btn-active-reject");

      if(btnA){
        btnA.onclick = async ()=>{
          try{
            btnA.disabled = true; if(btnR) btnR.disabled = true;
            const roleFinal = (document.querySelector('input[name="roleFinal"]:checked')?.value || (u.role_requested||u.role||"AGENT")).toUpperCase();
            await approve(u.code, { roleFinal });
            if(msg){ msg.style.display="block"; msg.textContent="승인 완료"; }
            selected = { bucket:null, code:null };
            await reloadAll(false);
          }catch(e){
            if(msg){ msg.style.display="block"; msg.textContent="승인 실패"; }
          }finally{
            if(btnA) btnA.disabled=false; if(btnR) btnR.disabled=false;
          }
        };
      }

      if(btnR){
        btnR.onclick = async ()=>{
          if(!confirm("반려 처리할까요?")) return;
          const reasonEl = document.getElementById("reject-reason");
          const reason = reasonEl ? String(reasonEl.value||"").trim() : "";
          try{
            btnR.disabled = true; if(btnA) btnA.disabled = true;
            await reject(u.code, reason);
            if(msg){ msg.style.display="block"; msg.textContent="반려 완료"; }
            selected = { bucket:null, code:null };
            await reloadAll(false);
          }catch(e){
            if(msg){ msg.style.display="block"; msg.textContent="반려 실패"; }
          }finally{
            if(btnR) btnR.disabled=false; if(btnA) btnA.disabled=false;
          }
        };
      }

      if(btnRe){
        btnRe.onclick = async ()=>{
          if(!confirm("재심사(대기로 이동) 할까요?")) return;
          try{
            btnRe.disabled = true;
            await reopen(u.code);
            if(msg){ msg.style.display="block"; msg.textContent="대기 목록으로 이동"; }
            selected = { bucket:null, code:null };
            await reloadAll(false);
          }catch(e){
            if(msg){ msg.style.display="block"; msg.textContent="처리 실패"; }
          }finally{
            if(btnRe) btnRe.disabled=false;
          }
        };
      }

      if(btnToP){
        btnToP.onclick = async ()=>{
          if(!confirm("이 계정을 다시 승인대기(PENDING)로 돌릴까요?")) return;
          try{
            btnToP.disabled = true;
            await activeToPending(u.code);
            if(msg){ msg.style.display="block"; msg.textContent="대기 상태로 변경"; }
            selected = { bucket:null, code:null };
            await reloadAll(false);
          }catch(e){
            if(msg){ msg.style.display="block"; msg.textContent="처리 실패"; }
          }finally{
            btnToP.disabled = false;
          }
        };
      }

      if(btnARj){
        btnARj.onclick = async ()=>{
          if(!confirm("승인완료 계정을 반려로 변경할까요?")) return;
          const reasonEl = document.getElementById("active-reject-reason");
          const reason = reasonEl ? String(reasonEl.value||"").trim() : "";
          try{
            btnARj.disabled = true;
            if(btnToP) btnToP.disabled = true;
            await activeReject(u.code, reason);
            if(msg){ msg.style.display="block"; msg.textContent="반려로 변경"; }
            selected = { bucket:null, code:null };
            await reloadAll(false);
          }catch(e){
            if(msg){ msg.style.display="block"; msg.textContent="처리 실패"; }
          }finally{
            btnARj.disabled = false;
            if(btnToP) btnToP.disabled = false;
          }
        };
      }
    }

    function renderPartnerForm(p){
      if(elCenterTitle) elCenterTitle.textContent = "파트너 등록";
      const isEdit = !!(p && p.entityType === "PARTNER");

      const bizVal = (p ? (p.business_no || "") : "");
      const nameVal = (p ? (p.company_name || "") : "");
      const ceoVal = (p ? (p.ceo_name || "") : "");
      const addrVal = (p ? (p.address || "") : "");
      const mgrVal = (p ? (p.manager_phone || "") : "");
      const taxVal = (p ? (p.tax_email || "") : "");

      elDetail.innerHTML = `
        <div>
          <div class="kv-table">
            <div class="kv-tr"><div class="kv-th">사업자번호</div><div class="kv-td"><input class="input" id="p-biz" value="${esc(bizVal)}" placeholder="000-00-00000"></div></div>
            <div class="kv-tr"><div class="kv-th">회사명</div><div class="kv-td"><input class="input" id="p-name" value="${esc(nameVal)}" placeholder="(필수)"></div></div>
            <div class="kv-tr"><div class="kv-th">대표자명</div><div class="kv-td"><input class="input" id="p-ceo" value="${esc(ceoVal)}" placeholder="(선택)"></div></div>
            <div class="kv-tr"><div class="kv-th">소재지</div><div class="kv-td"><input class="input" id="p-addr" value="${esc(addrVal)}" placeholder="(선택)"></div></div>
            <div class="kv-tr"><div class="kv-th">담당자연락처</div><div class="kv-td"><input class="input" id="p-mgr" value="${esc(mgrVal)}" placeholder="(선택)"></div></div>
            <div class="kv-tr"><div class="kv-th">이메일(세금계산서)</div><div class="kv-td"><input class="input" id="p-tax" value="${esc(taxVal)}" placeholder="(선택)"></div></div>
          </div>

          <div class="center-muted" id="partner-msg" style="margin-top:10px; display:none;"></div>
          <div class="actions-row">
            <button class="btn" id="btn-partner-save" style="flex:1;">저장</button>
            <button class="btn secondary" id="btn-partner-cancel" style="flex:0 0 auto;">닫기</button>
          </div>
        </div>
      `;

      const msg = document.getElementById("partner-msg");
      const btnSave = document.getElementById("btn-partner-save");
      const btnCancel = document.getElementById("btn-partner-cancel");

      if(btnCancel){
        btnCancel.onclick = ()=>{
          centerMode = "DETAIL";
          if(elCenterTitle) elCenterTitle.textContent = "승인 처리";
          renderDetail();
        };
      }

      if(btnSave){
        btnSave.onclick = async ()=>{
          const businessNo = String(document.getElementById("p-biz")?.value||"").trim();
          const companyName = String(document.getElementById("p-name")?.value||"").trim();
          const ceoName = String(document.getElementById("p-ceo")?.value||"").trim();
          const address = String(document.getElementById("p-addr")?.value||"").trim();
          const managerPhone = String(document.getElementById("p-mgr")?.value||"").trim();
          const taxEmail = String(document.getElementById("p-tax")?.value||"").trim();

          try{
            btnSave.disabled = true;
            await savePartner({ businessNo, companyName, ceoName, address, managerPhone, taxEmail });
            if(msg){ msg.style.display="block"; msg.textContent = "저장 완료"; }
            await reloadAll(true);
            // select newly created/updated partner
            const found = archive.find(x => x.entityType==="PARTNER" && String(x.business_no||"") === businessNo.replace(/\D/g,'').length===10 ? businessNo : x.business_no);
            // safe: select by latest partner code
            const latestPartner = archive.find(x => x.entityType==="PARTNER");
            if(latestPartner){
              selected = { bucket:"archive", code: latestPartner.code };
            }
            centerMode = "DETAIL";
            if(elCenterTitle) elCenterTitle.textContent = "승인 처리";
            renderArchive();
            renderPending();
            renderDetail();
          }catch(e){
            if(msg){ msg.style.display="block"; msg.textContent = (e && e.message) ? e.message : "저장 실패"; }
          }finally{
            btnSave.disabled = false;
          }
        };
      }
    }

    function bindClicks(){
      function onClick(e){
        const row = e.target.closest(".row");
        if(!row) return;

        selected.bucket = row.getAttribute("data-bucket");
        selected.code = row.getAttribute("data-code");

        // 중앙 패널은 "가변 워크벤치"여야 함:
        // 리스트를 클릭하면 항상 해당 컨텍스트로 복귀한다.
        if(selected.bucket === "pending"){
          centerMode = "DETAIL";
        }else if(selected.bucket === "archive"){
          const it = archive.find(x => String(x.code) === String(selected.code));
          if(it && it.entityType === "PARTNER"){
            centerMode = "PARTNER_EDIT";
          }else{
            centerMode = "DETAIL";
          }
        }else{
          centerMode = "DETAIL";
        }

        renderArchive();
        renderPending();
        renderDetail();
      }
      elArchive.onclick = onClick;
      elPending.onclick = onClick;
    }

    async function boot(){
      try{
        const [p, a, r, ps] = await Promise.all([
          fetchJson("/api/admin/pending-users"),
          fetchJson("/api/admin/active-users"),
          fetchJson("/api/admin/rejected-users"),
          fetchJson("/api/admin/partners"),
        ]);
        pending = p.map(normalizeUser);
        partners = ps.map(normalizePartner);
        const active = a.map(x=>normalizeUser(Object.assign({status:"ACTIVE"}, x)));
        const rejected = r.map(normalizeUser);

        const partnerArchive = partners.map(pp=>Object.assign({}, pp, { code: pp.partner_code, status: "PARTNER" }));
        archive = partnerArchive.concat(active).concat(rejected);

        // default select first pending if exists, else none
        if(pending.length){
          selected = { bucket:"pending", code: pending[0].code };
        }else{
          selected = { bucket:null, code:null };
        }

        bindClicks();
        renderArchive();
        renderPending();
        renderDetail();

        if(btnOpenPartner){
          btnOpenPartner.onclick = ()=>{
            selected = { bucket:null, code:null };
            centerMode = "PARTNER_NEW";
            renderArchive();
            renderPending();
            renderDetail();
          };
        }
      }catch(e){
        elArchive.innerHTML = `<div class="center-muted">데이터를 불러오지 못했습니다.</div>`;
        elPending.innerHTML = `<div class="center-muted">데이터를 불러오지 못했습니다.</div>`;
        elDetail.innerHTML = `<div class="center-muted">관리자만 접근 가능합니다.</div>`;
      }
    }

    boot();
  };
})();