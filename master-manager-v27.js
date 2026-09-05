(() => {
  const CARD_ID = 'householdMasterCardV1';
  const INPUT_ID = 'householdMasterJsonInputV1';
  const MASTER_VERSION = 1;

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
  const yen = n => Number.isFinite(Number(n))
    ? new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n))
    : '—';

  function emptyMasters(){
    return {version:MASTER_VERSION,accounts:[],cards:[],liabilities:[],fixedExpenses:[],updatedAt:null,sourceAsOf:null};
  }
  function normalizeMasters(input){
    const m = {...emptyMasters(), ...(input || {})};
    for(const k of ['accounts','cards','liabilities','fixedExpenses']) if(!Array.isArray(m[k])) m[k]=[];
    m.accounts = m.accounts.map((x,i)=>({id:x.id||`account-${i}-${crypto.randomUUID()}`,name:String(x.name||'').trim(),type:x.type||'OTHER',active:x.active!==false,...x}));
    m.cards = m.cards.map((x,i)=>({id:x.id||`card-${i}-${crypto.randomUUID()}`,name:String(x.name||'').trim(),active:x.active!==false,...x}));
    m.liabilities = m.liabilities.map((x,i)=>({id:x.id||`liability-${i}-${crypto.randomUUID()}`,name:String(x.name||'').trim(),...x}));
    m.fixedExpenses = m.fixedExpenses.map((x,i)=>({id:x.id||`fixed-${i}-${crypto.randomUUID()}`,name:String(x.name||'').trim(),cadence:x.cadence||'MONTHLY',active:x.active!==false,...x}));
    m.version=MASTER_VERSION;
    return m;
  }
  function getRawState(){
    const getter = window.getTreasuryStateRaw || window.getTreasuryState;
    const s = getter?.() || {};
    s.masters = normalizeMasters(s.masters);
    return s;
  }
  function commitState(next, reason){
    window.treasuryRecoverySnapshot?.(reason || '家計マスタ変更直前');
    next.masters = normalizeMasters(next.masters);
    next.masters.updatedAt = new Date().toISOString();
    window.replaceTreasuryState?.(next);
    window.repairTreasuryBankBalances?.();
    window.setTreasurySaveStatus?.('家計マスタ保存済み・同期中');
    window.cloudSyncOnLocalSave?.();
    renderMasterUi();
  }

  function ensureUi(){
    if($(CARD_ID)) return;
    const grid = document.querySelector('#settings .grid');
    if(!grid) return;
    const card = document.createElement('div');
    card.id = CARD_ID;
    card.className = 'card full';
    card.innerHTML = `
      <div class="title">家計マスタ <span class="tag">Phase 1</span></div>
      <div class="note" style="margin-bottom:12px">口座・カード・負債・固定費の基礎情報です。個人の実値は端末に保存し、クラウド同期時は暗号化されます。</div>
      <div class="controls" style="flex-wrap:wrap;margin-bottom:12px">
        <button class="btn" id="masterImportBtnV1">マスタJSON読込</button>
        <button class="btn secondary" id="masterExportBtnV1">マスタJSON書出し</button>
        <button class="btn secondary" id="masterAddAccountV1">＋口座</button>
        <button class="btn secondary" id="masterAddCardV1">＋カード</button>
        <button class="btn secondary" id="masterAddLiabilityV1">＋負債</button>
        <button class="btn secondary" id="masterAddFixedV1">＋固定費</button>
        <input class="hidden" id="${INPUT_ID}" type="file" accept="application/json,.json">
      </div>
      <div id="masterSummaryV1" class="tiny" style="margin-bottom:10px"></div>
      <div class="grid">
        <div class="card half"><div class="title">口座</div><div id="masterAccountsV1"></div></div>
        <div class="card half"><div class="title">カード</div><div id="masterCardsV1"></div></div>
        <div class="card half"><div class="title">負債</div><div id="masterLiabilitiesV1"></div></div>
        <div class="card half"><div class="title">固定費・準固定・年払い</div><div id="masterFixedV1"></div></div>
      </div>`;
    grid.appendChild(card);

    $('masterImportBtnV1').onclick = () => $(INPUT_ID).click();
    $(INPUT_ID).onchange = onImportFile;
    $('masterExportBtnV1').onclick = exportMasters;
    $('masterAddAccountV1').onclick = () => addOrEdit('accounts');
    $('masterAddCardV1').onclick = () => addOrEdit('cards');
    $('masterAddLiabilityV1').onclick = () => addOrEdit('liabilities');
    $('masterAddFixedV1').onclick = () => addOrEdit('fixedExpenses');
  }

  function rowHtml(kind, item){
    const id = encodeURIComponent(item.id);
    let meta='';
    if(kind==='accounts') meta = `${esc(item.type||'OTHER')}${item.active===false?' · 停止':''}`;
    else if(kind==='cards') meta = `${item.planned?'追加予定':'登録済み'}${item.active===false?' · 停止':''}`;
    else if(kind==='liabilities'){
      const shown = item.balance != null ? `残高 ${yen(item.balance)}` : item.referenceBalance != null ? `参考残高 ${yen(item.referenceBalance)}` : '残高未設定';
      meta = `${shown}${item.referenceDate?` · ${esc(item.referenceDate)}`:''}${item.targetPayoff?` · 完済目標 ${esc(item.targetPayoff)}`:''}`;
    } else {
      meta = `${esc(item.cadence||'MONTHLY')} · ${yen(item.amount)}${item.estimated?' · 概算':''}${item.active===false?' · 停止':''}`;
    }
    return `<div class="row"><div><b>${esc(item.name||'(名称未設定)')}</b><div class="tiny">${meta}</div></div><div class="controls"><button class="btn secondary" data-master-edit="${kind}:${id}">編集</button><button class="btn secondary" data-master-del="${kind}:${id}">削除</button></div></div>`;
  }

  function renderMasterUi(){
    ensureUi();
    if(!$(CARD_ID)) return;
    const s = getRawState(), m = s.masters;
    $('masterSummaryV1').textContent = `口座 ${m.accounts.length} / カード ${m.cards.length} / 負債 ${m.liabilities.length} / 固定費 ${m.fixedExpenses.length}${m.sourceAsOf?` · 基準 ${m.sourceAsOf}`:''}${m.updatedAt?` · 更新 ${new Date(m.updatedAt).toLocaleString('ja-JP')}`:''}`;
    $('masterAccountsV1').innerHTML = m.accounts.map(x=>rowHtml('accounts',x)).join('') || '<div class="muted">未登録</div>';
    $('masterCardsV1').innerHTML = m.cards.map(x=>rowHtml('cards',x)).join('') || '<div class="muted">未登録</div>';
    $('masterLiabilitiesV1').innerHTML = m.liabilities.map(x=>rowHtml('liabilities',x)).join('') || '<div class="muted">未登録</div>';
    const order={MONTHLY:1,SEMI_FIXED:2,ANNUAL:3};
    $('masterFixedV1').innerHTML = [...m.fixedExpenses].sort((a,b)=>(order[a.cadence]||9)-(order[b.cadence]||9)||String(a.name).localeCompare(String(b.name),'ja')).map(x=>rowHtml('fixedExpenses',x)).join('') || '<div class="muted">未登録</div>';
    document.querySelectorAll('[data-master-edit]').forEach(b=>b.onclick=()=>{
      const [kind,encId]=b.dataset.masterEdit.split(':'); addOrEdit(kind,decodeURIComponent(encId));
    });
    document.querySelectorAll('[data-master-del]').forEach(b=>b.onclick=()=>{
      const [kind,encId]=b.dataset.masterDel.split(':'); removeItem(kind,decodeURIComponent(encId));
    });
  }

  function onImportFile(e){
    const f=e.target.files?.[0]; if(!f) return;
    const r=new FileReader();
    r.onload=()=>{
      try{
        const obj=JSON.parse(r.result);
        if(obj.kind!=='household_treasury_master' && !obj.masters) throw new Error('家計マスタJSONではありません。');
        const next=getRawState();
        next.masters=normalizeMasters(obj.masters||{});
        next.masters.sourceAsOf=obj.asOf||obj.as_of||null;
        commitState(next,'家計マスタJSON読込直前');
        alert(`家計マスタを読み込みました。\n口座 ${next.masters.accounts.length} / カード ${next.masters.cards.length} / 負債 ${next.masters.liabilities.length} / 固定費 ${next.masters.fixedExpenses.length}`);
      }catch(err){ alert(err.message||'家計マスタJSONを読み込めませんでした。'); }
      e.target.value='';
    };
    r.readAsText(f);
  }

  function exportMasters(){
    const s=getRawState();
    const payload={kind:'household_treasury_master',version:MASTER_VERSION,asOf:s.masters.sourceAsOf||new Date().toISOString().slice(0,10),masters:s.masters};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),a=document.createElement('a');
    a.href=URL.createObjectURL(blob);a.download='household-treasury-private-master.json';a.click();URL.revokeObjectURL(a.href);
  }

  function addOrEdit(kind,id=null){
    const s=getRawState(), list=s.masters[kind];
    const current=id?list.find(x=>x.id===id):null;
    if(kind==='accounts'){
      const name=prompt('口座名',current?.name||''); if(!name)return;
      const type=prompt('種別（BANK / BROKER / CASH / OTHER）',current?.type||'BANK'); if(!type)return;
      const item={...(current||{}),id:current?.id||crypto.randomUUID(),name,type,active:current?.active!==false};
      upsert(list,item);
    }else if(kind==='cards'){
      const name=prompt('カード名',current?.name||''); if(!name)return;
      const item={...(current||{}),id:current?.id||crypto.randomUUID(),name,active:current?.active!==false};
      upsert(list,item);
    }else if(kind==='liabilities'){
      const name=prompt('負債名',current?.name||''); if(!name)return;
      const raw=prompt('現在残高（未確定なら空欄）',current?.balance??'');
      const balance=raw===''?null:Number(raw); if(balance!==null&&!Number.isFinite(balance))return alert('残高が数値ではありません。');
      const dueDate=prompt('期限（未設定なら空欄）',current?.dueDate||'')||null;
      const item={...(current||{}),id:current?.id||crypto.randomUUID(),name,balance,dueDate};
      upsert(list,item);
    }else{
      const name=prompt('固定費名',current?.name||''); if(!name)return;
      const amount=Number(prompt('金額（正の金額）',current?.amount??'')); if(!Number.isFinite(amount))return alert('金額が数値ではありません。');
      const cadence=prompt('周期（MONTHLY / SEMI_FIXED / ANNUAL）',current?.cadence||'MONTHLY'); if(!cadence)return;
      const item={...(current||{}),id:current?.id||crypto.randomUUID(),name,amount:Math.abs(amount),cadence:cadence.toUpperCase(),active:current?.active!==false};
      upsert(list,item);
    }
    commitState(s,`${kind}マスタ編集直前`);
  }
  function upsert(list,item){const i=list.findIndex(x=>x.id===item.id);if(i>=0)list[i]=item;else list.push(item)}
  function removeItem(kind,id){
    const s=getRawState(),list=s.masters[kind],item=list.find(x=>x.id===id);if(!item)return;
    if(!confirm(`${item.name||'この項目'}を削除しますか？`))return;
    s.masters[kind]=list.filter(x=>x.id!==id);commitState(s,`${kind}マスタ削除直前`);
  }

  const previousRender = typeof render === 'function' ? render : null;
  if(previousRender){
    render = function renderWithHouseholdMaster(){ previousRender(); renderMasterUi(); };
  }
  ensureUi();
  renderMasterUi();
})();