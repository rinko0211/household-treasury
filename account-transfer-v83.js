(() => {
  if (window.__accountTransferV83) return;
  window.__accountTransferV83 = true;

  const $ = id => document.getElementById(id);
  const stateNow = () => (window.getTreasuryStateRaw || window.getTreasuryState)?.() || {};
  const yen = n => new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
  const iso = d => { const x=new Date(d); return Number.isNaN(x.getTime())?'':`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`; };
  const today = () => iso(new Date());
  const norm = s => String(s ?? '').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/\.]/g,'').toUpperCase();
  const esc = s => String(s ?? '').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const hash = s => { let h=2166136261; const x=String(s); for(let i=0;i<x.length;i++){h^=x.charCodeAt(i);h=Math.imul(h,16777619)} return (h>>>0).toString(16); };
  const ACTIVE_TYPES = new Set(['BANK','CASH']);
  let renderTimer=null, editingTransferId=null, editingAccountId=null;

  function ensureState(st){
    st.masters = st.masters || {accounts:[],cards:[],liabilities:[],fixedExpenses:[]};
    st.masters.accounts = Array.isArray(st.masters.accounts) ? st.masters.accounts : [];
    st.accountTransfersV83 = Array.isArray(st.accountTransfersV83) ? st.accountTransfersV83 : [];
    return st;
  }
  function accountType(a){ return String(a?.type || 'OTHER').toUpperCase(); }
  function liquid(a){ return ACTIVE_TYPES.has(accountType(a)); }
  function accountLabel(a){
    if (!a) return '不明';
    if (accountType(a)==='BROKER') return `${a.name || '証券口座'} 預り金`;
    return a.name || '口座';
  }
  function classifySource(source){
    const n=norm(source);
    if (!n) return null;
    if (n.includes('SECURITIES') || n.includes('SHOKEN') || n.includes('証券')) return 'BROKER';
    if (n.includes('BANK') || n.includes('銀行') || n.includes('YUCHO') || n.includes('ゆうちょ') || n.includes('郵貯')) return 'BANK';
    return null;
  }
  function prettySource(source,type){
    const n=norm(source);
    if (n.includes('RAKUTENBANK') || n.includes('楽天銀行')) return '楽天銀行';
    if (n.includes('YUCHO') || n.includes('ゆうちょ') || n.includes('郵貯')) return 'ゆうちょ';
    if (n.includes('RAKUTEN') && (type==='BROKER' || n.includes('SECURITIES') || n.includes('証券'))) return '楽天証券';
    return String(source || (type==='BROKER'?'証券口座':'銀行口座')).trim();
  }
  function sameSource(a,b){ const na=norm(a),nb=norm(b); return !!na && !!nb && (na===nb || na.includes(nb) || nb.includes(na)); }

  function latestBankRows(st){
    const m=new Map();
    (st.cashTransactions||[]).forEach((t,i)=>{
      if (t.balance_after===null || t.balance_after==='' || !Number.isFinite(Number(t.balance_after)) || !t.date) return;
      const type=classifySource(t.source); if(type!=='BANK') return;
      const key=norm(t.source); if(!key) return;
      const cand={value:Number(t.balance_after),asOf:String(t.date),source:String(t.source||''),index:i,type:'BANK'};
      const cur=m.get(key); if(!cur || cand.asOf>cur.asOf || (cand.asOf===cur.asOf && i>cur.index)) m.set(key,cand);
    });
    return [...m.values()];
  }
  function latestBrokerRows(st){
    const m=new Map();
    (st.assetSnapshots||[]).forEach((x,i)=>{
      if (x.cash_balance===null || x.cash_balance==='' || !Number.isFinite(Number(x.cash_balance))) return;
      const source=String(x.institution||x.source||'証券口座'); const key=norm(source); if(!key) return;
      const asOf=String(x.snapshot_date||x.date||'');
      const cand={value:Number(x.cash_balance),asOf,source,index:i,type:'BROKER'};
      const cur=m.get(key); if(!cur || cand.asOf>cur.asOf || (cand.asOf===cur.asOf && i>cur.index)) m.set(key,cand);
    });
    return [...m.values()];
  }
  function importedRows(st){ return [...latestBankRows(st),...latestBrokerRows(st)]; }

  function accountMatchesImport(a,row){
    if (a.sourceKey && sameSource(a.sourceKey,row.source)) return true;
    if (sameSource(a.name,row.source)) return true;
    const n=norm(a.name),s=norm(row.source);
    if (n.includes('楽天銀行') && (s.includes('RAKUTENBANK')||s.includes('楽天銀行'))) return true;
    if ((n.includes('ゆうちょ')||n.includes('郵貯')) && (s.includes('YUCHO')||s.includes('ゆうちょ')||s.includes('郵貯'))) return true;
    if (n.includes('楽天証券') && (s.includes('RAKUTEN')||s.includes('楽天証券'))) return true;
    return false;
  }
  function currentAccounts(st=stateNow()){
    ensureState(st);
    const imports=importedRows(st), used=new Set(), out=[];
    for(const raw of st.masters.accounts.filter(x=>x.active!==false)){
      const a={...raw,type:accountType(raw)};
      let imp=null,impIdx=-1;
      imports.forEach((r,i)=>{ if(used.has(i)||!accountMatchesImport(a,r))return; if(!imp || String(r.asOf)>String(imp.asOf)){imp=r;impIdx=i} });
      if(impIdx>=0)used.add(impIdx);
      const manualValue=Number.isFinite(Number(a.balance))?Number(a.balance):null;
      const manualAsOf=String(a.balanceAsOf||a.balance_as_of||'');
      const useManual=manualValue!==null && (!imp || (manualAsOf && manualAsOf>=String(imp.asOf||'')));
      out.push({...a,currentBalance:useManual?manualValue:(imp?imp.value:manualValue),balanceAsOf:useManual?manualAsOf:(imp?.asOf||manualAsOf||''),balanceSource:useManual?'manual':imp?'import':'none',sourceKey:a.sourceKey||imp?.source||''});
    }
    imports.forEach((r,i)=>{
      if(used.has(i))return;
      const id=`detected:${r.type.toLowerCase()}:${hash(norm(r.source))}`;
      out.push({id,name:prettySource(r.source,r.type),type:r.type,active:true,autoDetected:true,sourceKey:r.source,currentBalance:r.value,balanceAsOf:r.asOf,balanceSource:'import'});
    });
    return out.sort((a,b)=>{const order={BANK:1,CASH:2,BROKER:3,OTHER:4};return (order[accountType(a)]||9)-(order[accountType(b)]||9)||String(a.name).localeCompare(String(b.name),'ja')});
  }
  function accountMap(st){ return new Map(currentAccounts(st).map(a=>[String(a.id),a])); }
  function resolveAccount(st,id,fallback={}){
    const a=accountMap(st).get(String(id));
    return a || {id:String(id||''),name:fallback.name||'不明',type:fallback.type||'OTHER',currentBalance:null,balanceAsOf:''};
  }
  function cashflowImpact(st,t){
    const from=resolveAccount(st,t.from_account_id,{name:t.from_account_name,type:t.from_account_type});
    const to=resolveAccount(st,t.to_account_id,{name:t.to_account_name,type:t.to_account_type});
    const n=Math.abs(Number(t.amount)||0); if(!n)return 0;
    if(liquid(from)===liquid(to))return 0;
    return liquid(to)?n:-n;
  }

  function addMonths(date,n){const d=new Date(`${date}T12:00:00`);if(Number.isNaN(d.getTime()))return'';const day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+n);const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(day,last));return iso(d)}
  function addYears(date,n){const d=new Date(`${date}T12:00:00`);if(Number.isNaN(d.getTime()))return'';const m=d.getMonth(),day=d.getDate();d.setFullYear(d.getFullYear()+n,0,1);d.setMonth(m,1);const last=new Date(d.getFullYear(),m+1,0).getDate();d.setDate(Math.min(day,last));return iso(d)}
  function transferOccurrences(st,days=180){
    ensureState(st); const from=today(),to=iso(new Date(Date.now()+Number(days)*86400000)),out=[];
    for(const t of st.accountTransfersV83.filter(x=>x.active!==false)){
      const rec=String(t.recurring||'NONE').toUpperCase(); let d=String(t.date||''); if(!d)continue;
      if(rec==='NONE'){if(d>=from&&d<=to)out.push({...t,occurrence_date:d});continue}
      let guard=0; while(d<from&&guard++<600)d=rec==='MONTHLY'?addMonths(d,1):addYears(d,1);
      while(d&&d<=to&&guard++<1200){out.push({...t,occurrence_date:d});d=rec==='MONTHLY'?addMonths(d,1):addYears(d,1)}
    }
    return out.sort((a,b)=>String(a.occurrence_date).localeCompare(String(b.occurrence_date))||String(a.name||'').localeCompare(String(b.name||''),'ja'));
  }

  if(typeof generated==='function'&&!window.__accountTransferGeneratedV83){
    window.__accountTransferGeneratedV83=true;
    const previousGenerated=generated;
    generated=function generatedWithAccountTransfersV83(days=90){
      const base=previousGenerated(days)||[],st=stateNow();
      const extra=transferOccurrences(st,days).map(t=>{
        const impact=cashflowImpact(st,t),amt=Math.abs(Number(t.amount)||0);
        return {id:`acct-transfer:${t.id}:${t.occurrence_date}`,date:t.occurrence_date,name:t.name||`${t.from_account_name||'口座'} → ${t.to_account_name||'口座'}`,amount:impact,type:'ACCOUNT_TRANSFER',future_kind:'TRANSFER',expense_scope:'TRANSFER',certainty:t.certainty||'CONFIRMED',generated:true,source:'account_transfer_v83',transfer_id:t.id,transfer_amount:amt,from_account_id:t.from_account_id,to_account_id:t.to_account_id,from_account_name:t.from_account_name,to_account_name:t.to_account_name};
      });
      return [...base,...extra].sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.name||'').localeCompare(String(b.name||''),'ja'));
    };
  }

  function projectedAccounts(days=90){
    const st=stateNow(),accounts=currentAccounts(st),map=new Map(accounts.map(a=>[String(a.id),{...a,projectedBalance:Number.isFinite(Number(a.currentBalance))?Number(a.currentBalance):null}]));
    for(const t of transferOccurrences(st,days)){
      const amount=Math.abs(Number(t.amount)||0); if(!amount)continue;
      const date=t.occurrence_date;
      const from=map.get(String(t.from_account_id)),to=map.get(String(t.to_account_id));
      if(from&&from.projectedBalance!==null&&(!from.balanceAsOf||date>from.balanceAsOf))from.projectedBalance-=amount;
      if(to&&to.projectedBalance!==null&&(!to.balanceAsOf||date>to.balanceAsOf))to.projectedBalance+=amount;
    }
    return [...map.values()];
  }

  function materializeAccount(st,id){
    ensureState(st); const sid=String(id),existing=st.masters.accounts.find(x=>String(x.id)===sid); if(existing)return existing;
    const detected=currentAccounts(st).find(x=>String(x.id)===sid); if(!detected)return null;
    const item={id:detected.id,name:detected.name,type:detected.type,active:true,sourceKey:detected.sourceKey||'',autoDetected:true};
    st.masters.accounts.push(item); return item;
  }
  function persist(st,msg){
    window.treasuryRecoverySnapshot?.(`${msg}直前`);
    window.replaceTreasuryState?.(st);
    window.repairTreasuryBankBalances?.();
    window.setTreasurySaveStatus?.(`${msg}・同期中`);
    window.cloudSyncOnLocalSave?.();
    scheduleRender(60);
    try{window.renderMobileInteractionV70?.()}catch{}
    try{render()}catch{}
  }

  function ensureStyle(){
    if($('accountTransferStyleV83'))return;
    const s=document.createElement('style');s.id='accountTransferStyleV83';s.textContent=`
      #accountTrackerV83 .v83-account-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;margin-top:10px}
      #accountTrackerV83 .v83-account{border:1px solid var(--border,#d8dee8);border-radius:12px;padding:11px;background:rgba(127,127,127,.035)}
      #accountTrackerV83 .v83-balance{font-size:21px;font-weight:800;margin-top:5px}
      #accountTrackerV83 .v83-arrow{opacity:.55;padding:0 5px}
      #accountTrackerV83 .v83-transfer-row{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;padding:9px 0;border-top:1px solid var(--border,#d8dee8)}
      #accountTransferModalV83 .v83-bg,#accountEditModalV83 .v83-bg{position:fixed;inset:0;background:#0009;z-index:12000}
      #accountTransferModalV83 .v83-modal,#accountEditModalV83 .v83-modal{position:fixed;z-index:12001;left:50%;top:50%;transform:translate(-50%,-50%);width:min(94vw,600px);max-height:90vh;overflow:auto}
      @media(max-width:650px){#accountTrackerV83 .v83-account-grid{grid-template-columns:1fr}}
    `;document.head.appendChild(s);
  }
  function ensureDashboard(){
    const root=$('dashboardPlanningV79')||document.querySelector('#dashboard .grid');if(!root)return null;
    let card=$('accountTrackerV83');if(card)return card;
    ensureStyle();card=document.createElement('div');card.id='accountTrackerV83';card.className='card full';
    const old=$('dashboardBankV81'); if(old)old.style.display='none';
    card.innerHTML=`<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap"><div><div class="title">資産・口座残高 <span class="tag">v83</span></div><div class="tiny">銀行残高と証券の預り金を口座別に追跡し、予定した資金移動を将来残高へ反映します。</div></div><div class="controls"><select id="accountHorizonV83"><option value="30">30日後</option><option value="60">60日後</option><option value="90" selected>90日後</option><option value="180">6か月後</option></select><button type="button" class="btn secondary" id="addAccountV83">＋口座</button><button type="button" class="btn" id="addTransferV83">↔ 資金移動</button></div></div><div id="accountRowsV83" class="v83-account-grid"></div><div style="margin-top:14px"><div class="title" style="font-size:15px">資金移動予定</div><div id="accountTransfersRowsV83"></div></div>`;
    const bank=$('dashboardBankV81');if(bank)bank.after(card);else root.prepend(card);
    $('accountHorizonV83').onchange=()=>renderDashboard();$('addAccountV83').onclick=()=>openAccount();$('addTransferV83').onclick=()=>openTransfer();
    card.addEventListener('click',e=>{const bal=e.target.closest?.('[data-v83-account]'),edit=e.target.closest?.('[data-v83-transfer-edit]'),del=e.target.closest?.('[data-v83-transfer-del]');if(bal)openAccount(bal.dataset.v83Account);if(edit)openTransfer(edit.dataset.v83TransferEdit);if(del)deleteTransfer(del.dataset.v83TransferDel)});
    return card;
  }
  function ensureCashflowButton(){
    const mobile=$('mobileAddFutureV70'); if(mobile&&!$('mobileAddTransferV83')){const b=document.createElement('button');b.id='mobileAddTransferV83';b.type='button';b.className='btn secondary';b.style.width='100%';b.style.margin='4px 0 8px';b.textContent='↔ 資金移動を追加';b.onclick=e=>{e.preventDefault();e.stopPropagation();openTransfer()};mobile.after(b)}
    const desktop=$('futureAddV37'); if(desktop&&!$('desktopAddTransferV83')){const b=document.createElement('button');b.id='desktopAddTransferV83';b.type='button';b.className='btn secondary';b.textContent='↔ 資金移動';b.onclick=e=>{e.preventDefault();e.stopPropagation();openTransfer()};desktop.after(b)}
  }
  function retireLegacyTransferChoice(){
    for(const id of ['v70EventKind','futureKindV37']){const sel=$(id),op=sel?.querySelector('option[value="TRANSFER"]');if(op){op.disabled=true;op.textContent='資金移動（専用ボタンから）'}}
  }
  function ensureTransferModal(){
    if($('accountTransferModalV83'))return;
    ensureStyle();const m=document.createElement('div');m.id='accountTransferModalV83';m.hidden=true;m.style.display='none';m.innerHTML=`<div class="v83-bg" data-v83-transfer-close></div><div class="card v83-modal"><div class="title" id="transferTitleV83">資金移動</div><div class="form" style="grid-template-columns:1fr 1fr"><div class="field"><label>日付</label><input id="transferDateV83" type="date"></div><div class="field"><label>金額</label><input id="transferAmountV83" type="number" min="0" step="1"></div><div class="field"><label>出金元</label><select id="transferFromV83"></select></div><div class="field"><label>入金先</label><select id="transferToV83"></select></div><div class="field"><label>確度</label><select id="transferCertV83"><option value="CONFIRMED">確定</option><option value="ESTIMATED">予定</option></select></div><div class="field"><label>繰り返し</label><select id="transferRecurringV83"><option value="NONE">単発</option><option value="MONTHLY">毎月</option><option value="YEARLY">毎年</option></select></div><div class="field" style="grid-column:1/-1"><label>内容</label><input id="transferNameV83" placeholder="例：楽天証券預り金を楽天銀行へ移動"></div><div class="field" style="grid-column:1/-1"><label>メモ</label><input id="transferNoteV83"></div></div><div class="note" style="margin-top:9px">出金元口座は減り、入金先口座は増えます。銀行↔銀行はCash Flow総額を変えません。証券→銀行は銀行で使える資金が増えるためCash Flowへ＋反映します。</div><div class="controls" style="margin-top:12px"><button type="button" class="btn" id="saveTransferV83">保存</button><button type="button" class="btn secondary" data-v83-transfer-close>キャンセル</button></div></div>`;document.body.appendChild(m);
    m.querySelectorAll('[data-v83-transfer-close]').forEach(x=>x.onclick=closeTransfer);$('saveTransferV83').onclick=saveTransfer;
  }
  function ensureAccountModal(){
    if($('accountEditModalV83'))return;
    ensureStyle();const m=document.createElement('div');m.id='accountEditModalV83';m.hidden=true;m.style.display='none';m.innerHTML=`<div class="v83-bg" data-v83-account-close></div><div class="card v83-modal"><div class="title" id="accountTitleV83">口座・資産</div><div class="form"><div class="field"><label>名称</label><input id="accountNameV83"></div><div class="field"><label>種別</label><select id="accountTypeV83"><option value="BANK">銀行</option><option value="BROKER">証券（預り金）</option><option value="CASH">現金</option><option value="OTHER">その他</option></select></div><div class="field"><label>現在残高</label><input id="accountBalanceV83" type="number" step="1"></div><div class="field"><label>残高基準日</label><input id="accountAsOfV83" type="date"></div></div><div class="tiny" style="margin-top:8px">CSV/資産残高の取込値より新しい基準日で手入力した場合は、手入力残高を現在値として使います。</div><div class="controls" style="margin-top:12px"><button type="button" class="btn" id="saveAccountV83">保存</button><button type="button" class="btn secondary" data-v83-account-close>キャンセル</button></div></div>`;document.body.appendChild(m);
    m.querySelectorAll('[data-v83-account-close]').forEach(x=>x.onclick=closeAccount);$('saveAccountV83').onclick=saveAccount;
  }
  function show(id){const m=$(id);if(!m)return;m.hidden=false;m.style.display='block'}
  function hide(id){const m=$(id);if(!m)return;m.hidden=true;m.style.display='none'}
  function accountOptions(selected=''){const rows=currentAccounts();return rows.map(a=>`<option value="${esc(a.id)}" ${String(a.id)===String(selected)?'selected':''}>${esc(accountLabel(a))} · ${a.currentBalance===null?'残高未設定':yen(a.currentBalance)}</option>`).join('')}
  function openTransfer(id=''){
    ensureTransferModal();const st=stateNow();ensureState(st);const t=id?st.accountTransfersV83.find(x=>String(x.id)===String(id)):null;editingTransferId=t?.id||null;
    const accounts=currentAccounts(st);if(accounts.length<2){alert('資金移動には2つ以上の口座・資産が必要です。まず口座を追加してください。');openAccount();return}
    $('transferTitleV83').textContent=t?'資金移動を編集':'資金移動を追加';$('transferDateV83').value=t?.date||today();$('transferAmountV83').value=t?.amount??'';$('transferFromV83').innerHTML=accountOptions(t?.from_account_id||accounts[0]?.id);$('transferToV83').innerHTML=accountOptions(t?.to_account_id||accounts[1]?.id);$('transferCertV83').value=t?.certainty||'CONFIRMED';$('transferRecurringV83').value=t?.recurring||'NONE';$('transferNameV83').value=t?.name||'';$('transferNoteV83').value=t?.note||'';show('accountTransferModalV83');
  }
  function closeTransfer(){hide('accountTransferModalV83');editingTransferId=null}
  function saveTransfer(){
    const st=stateNow();ensureState(st);const date=$('transferDateV83').value,amount=Math.abs(Number($('transferAmountV83').value)),fromId=$('transferFromV83').value,toId=$('transferToV83').value,certainty=$('transferCertV83').value,recurring=$('transferRecurringV83').value,note=$('transferNoteV83').value.trim();
    if(!date||!Number.isFinite(amount)||amount<=0||!fromId||!toId||fromId===toId)return alert('日付・金額・出金元・入金先を確認してください。');
    const from=materializeAccount(st,fromId)||resolveAccount(st,fromId),to=materializeAccount(st,toId)||resolveAccount(st,toId);let t=editingTransferId?st.accountTransfersV83.find(x=>String(x.id)===String(editingTransferId)):null;const isNew=!t;if(!t){t={id:crypto.randomUUID(),createdAt:new Date().toISOString(),active:true};st.accountTransfersV83.push(t)}
    const autoName=`${from.name} → ${to.name}`;Object.assign(t,{date,amount,from_account_id:from.id,to_account_id:to.id,from_account_name:from.name,to_account_name:to.name,from_account_type:accountType(from),to_account_type:accountType(to),certainty,recurring,name:$('transferNameV83').value.trim()||autoName,note,updatedAt:new Date().toISOString(),version:1});
    persist(st,isNew?'資金移動追加':'資金移動編集');closeTransfer();
  }
  function deleteTransfer(id){const st=stateNow();ensureState(st);const t=st.accountTransfersV83.find(x=>String(x.id)===String(id));if(!t)return;if(!confirm(`「${t.name||'この資金移動'}」を削除しますか？`))return;st.accountTransfersV83=st.accountTransfersV83.filter(x=>String(x.id)!==String(id));persist(st,'資金移動削除')}
  function openAccount(id=''){
    ensureAccountModal();const st=stateNow(),a=id?currentAccounts(st).find(x=>String(x.id)===String(id)):null;editingAccountId=a?.id||null;$('accountTitleV83').textContent=a?'口座・資産を編集':'口座・資産を追加';$('accountNameV83').value=a?.name||'';$('accountTypeV83').value=accountType(a||{type:'BANK'});$('accountBalanceV83').value=a?.currentBalance??'';$('accountAsOfV83').value=a?.balanceAsOf||today();show('accountEditModalV83');
  }
  function closeAccount(){hide('accountEditModalV83');editingAccountId=null}
  function saveAccount(){
    const st=stateNow();ensureState(st);const name=$('accountNameV83').value.trim(),type=$('accountTypeV83').value,raw=$('accountBalanceV83').value,balance=raw===''?null:Number(raw),asOf=$('accountAsOfV83').value;if(!name||!['BANK','BROKER','CASH','OTHER'].includes(type)||balance!==null&&!Number.isFinite(balance))return alert('名称・種別・残高を確認してください。');
    let a=editingAccountId?materializeAccount(st,editingAccountId):null;if(!a){a={id:crypto.randomUUID(),active:true};st.masters.accounts.push(a)}Object.assign(a,{name,type,balance,balanceAsOf:asOf||today(),updatedAt:new Date().toISOString()});persist(st,editingAccountId?'口座残高更新':'口座追加');closeAccount();
  }

  function renderDashboard(){
    const card=ensureDashboard();if(!card)return;const days=Number($('accountHorizonV83')?.value)||90,rows=projectedAccounts(days),host=$('accountRowsV83'),thost=$('accountTransfersRowsV83');
    const currentKnown=rows.filter(x=>x.currentBalance!==null).reduce((a,x)=>a+Number(x.currentBalance),0),projectedKnown=rows.filter(x=>x.projectedBalance!==null).reduce((a,x)=>a+Number(x.projectedBalance),0);
    host.innerHTML=rows.length?rows.map(a=>`<div class="v83-account"><div style="display:flex;justify-content:space-between;gap:8px"><div><b>${esc(accountLabel(a))}</b><div class="tiny">${esc(accountType(a))}${a.balanceAsOf?` · 基準 ${esc(a.balanceAsOf)}`:''} · ${a.balanceSource==='import'?'取込':a.balanceSource==='manual'?'手入力':'未設定'}</div></div><button type="button" class="btn secondary" data-v83-account="${esc(a.id)}">残高設定</button></div><div class="v83-balance">${a.currentBalance===null?'—':yen(a.currentBalance)} <span class="v83-arrow">→</span> ${a.projectedBalance===null?'—':yen(a.projectedBalance)}</div><div class="tiny">現在 → ${days===180?'6か月':days+'日'}後予想</div></div>`).join(''):'<div class="muted">口座・資産がありません。</div>';
    const st=stateNow(),transfers=[...ensureState(st).accountTransfersV83].sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));
    thost.innerHTML=`<div class="row"><span>把握済み残高合計</span><b>${yen(currentKnown)} → ${yen(projectedKnown)}</b></div>`+(transfers.length?transfers.map(t=>`<div class="v83-transfer-row"><div style="min-width:0"><b>${esc(t.name||'資金移動')}</b><div class="tiny">${esc(t.date||'')} · ${esc(t.from_account_name||'')} → ${esc(t.to_account_name||'')} · ${String(t.recurring||'NONE')==='NONE'?'単発':String(t.recurring)==='MONTHLY'?'毎月':'毎年'}</div>${t.note?`<div class="tiny">${esc(t.note)}</div>`:''}</div><div style="text-align:right"><b class="amt">${yen(Math.abs(Number(t.amount)||0))}</b><div class="controls" style="margin-top:5px;justify-content:flex-end"><button type="button" class="btn secondary" data-v83-transfer-edit="${esc(t.id)}">編集</button><button type="button" class="btn danger" data-v83-transfer-del="${esc(t.id)}">削除</button></div></div></div>`).join(''):'<div class="muted" style="padding:8px 0">資金移動予定なし</div>');
  }
  function render(){ensureDashboard();ensureCashflowButton();retireLegacyTransferChoice();renderDashboard()}
  function scheduleRender(ms=100){clearTimeout(renderTimer);renderTimer=setTimeout(render,ms)}

  document.addEventListener('click',e=>{if(e.target.closest?.('[data-page="dashboard"],[data-page="cashflow"],#futureAddV37'))scheduleRender(80)},false);
  window.addEventListener('treasury:pagechange',()=>scheduleRender(100));
  window.addEventListener('pageshow',()=>scheduleRender(160));
  const prevReplace=window.replaceTreasuryState;
  if(typeof prevReplace==='function'&&!window.__accountTransferReplaceV83){window.__accountTransferReplaceV83=true;window.replaceTreasuryState=function replaceTreasuryStateAccountTransferV83(next){const out=prevReplace(next);scheduleRender(100);return out}}
  function wait(n=0){if(typeof generated==='function'&&(document.querySelector('#dashboard .grid')||$('dashboardPlanningV79'))){render();return}if(n<80)setTimeout(()=>wait(n+1),75)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>wait(),{once:true});else wait();
  window.householdAccountTransferV83={render,currentAccounts,projectedAccounts,transferOccurrences,cashflowImpact,openTransfer};
})();