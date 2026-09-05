(() => {
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const yen=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
  const stateNow=()=> (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{};
  let renderTimer=null;

  function expenseId(kind,obj,index){
    if(kind==='purchase')return String(obj.purchase_id||`purchase:${index}`);
    return String(obj.id||`cash:${index}`);
  }
  function expenseAmount(kind,obj){return kind==='purchase'?Math.abs(Number(obj.original_amount)||0):Math.abs(Math.min(0,Number(obj.amount)||0))}
  function expenseDate(kind,obj){return kind==='purchase'?obj.purchase_date:obj.date}
  function expenseName(kind,obj){return kind==='purchase'?(obj.merchant_raw||obj.merchant_normalized||'カード利用'):(obj.description_raw||obj.description||'銀行支出')}
  function expenseScope(obj){return String(obj.expense_scope||obj.ordinary_or_special||'NORMAL')}
  function reimbursementName(t){return [t.source,t.description_raw||t.description||'入金'].filter(Boolean).join(' · ')}

  function ensureState(st){if(!Array.isArray(st.reimbursementLinks))st.reimbursementLinks=[];if(st.reimbursementVersion!==1)st.reimbursementVersion=1}
  function findExpense(st,ref){
    const arr=ref.kind==='purchase'?(st.purchaseEvents||[]):(st.cashTransactions||[]);
    const index=arr.findIndex((x,i)=>expenseId(ref.kind,x,i)===String(ref.id));
    return index>=0?{obj:arr[index],index,kind:ref.kind}:null;
  }
  function findCash(st,id){const index=(st.cashTransactions||[]).findIndex((x,i)=>String(x.id||`cash:${i}`)===String(id));return index>=0?{obj:st.cashTransactions[index],index}:null}
  function allocatedForExpense(st,ref,ignoreId=''){return (st.reimbursementLinks||[]).filter(x=>x.id!==ignoreId&&x.expense_ref?.kind===ref.kind&&String(x.expense_ref?.id)===String(ref.id)).reduce((a,x)=>a+Math.abs(Number(x.reimbursement_amount)||0),0)}
  function allocatedFromIncome(st,id,ignoreId=''){return (st.reimbursementLinks||[]).filter(x=>x.id!==ignoreId&&String(x.reimbursement_ref?.id)===String(id)).reduce((a,x)=>a+Math.abs(Number(x.reimbursement_amount)||0),0)}

  function recalc(st){
    ensureState(st);
    for(const p of st.purchaseEvents||[]){delete p.net_household_cost;delete p.linked_reimbursement_id;delete p.reimbursement_ids}
    for(const t of st.cashTransactions||[]){delete t.reimbursement_link_ids;delete t.linked_expense_id}
    for(const link of st.reimbursementLinks){
      const e=findExpense(st,link.expense_ref||{}),r=findCash(st,link.reimbursement_ref?.id);
      if(!e||!r)continue;
      const gross=expenseAmount(e.kind,e.obj),amt=Math.abs(Number(link.reimbursement_amount)||0);
      link.gross_expense=gross;link.net_household_cost=gross-allocatedForExpense(st,link.expense_ref,link.id)-amt;
      e.obj.reimbursement_ids=e.obj.reimbursement_ids||[];if(!e.obj.reimbursement_ids.includes(link.id))e.obj.reimbursement_ids.push(link.id);
      e.obj.linked_reimbursement_id=e.obj.reimbursement_ids[0]||null;
      e.obj.net_household_cost=gross-(st.reimbursementLinks||[]).filter(x=>x.expense_ref?.kind===link.expense_ref.kind&&String(x.expense_ref?.id)===String(link.expense_ref.id)).reduce((a,x)=>a+Math.abs(Number(x.reimbursement_amount)||0),0);
      r.obj.reimbursement_link_ids=r.obj.reimbursement_link_ids||[];if(!r.obj.reimbursement_link_ids.includes(link.id))r.obj.reimbursement_link_ids.push(link.id);
      r.obj.linked_expense_id=link.expense_ref.id;
      r.obj.reimbursement_event=true;
    }
  }
  function persist(st){
    ensureState(st);recalc(st);window.replaceTreasuryState?.(st);window.repairTreasuryBankBalances?.();window.cloudSyncOnLocalSave?.();
  }

  function expenseCandidates(st){
    const rows=[];
    (st.purchaseEvents||[]).forEach((p,index)=>{const gross=expenseAmount('purchase',p);if(!gross)return;const ref={kind:'purchase',id:expenseId('purchase',p,index)},allocated=allocatedForExpense(st,ref);if(gross-allocated<=0)return;rows.push({ref,index,date:expenseDate('purchase',p),name:expenseName('purchase',p),amount:gross,remaining:gross-allocated,scope:expenseScope(p),source:p.card||'card'})});
    (st.cashTransactions||[]).forEach((t,index)=>{if(Number(t.amount)>=0||String(t.expense_scope)==='TRANSFER'||t.cashflow_type==='CARD_SETTLEMENT')return;const gross=expenseAmount('cash',t);if(!gross)return;const ref={kind:'cash',id:expenseId('cash',t,index)},allocated=allocatedForExpense(st,ref);if(gross-allocated<=0)return;rows.push({ref,index,date:t.date||'',name:expenseName('cash',t),amount:gross,remaining:gross-allocated,scope:expenseScope(t),source:t.source||'bank'})});
    return rows.sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,250)
  }
  function reimbursementCandidates(st){
    return (st.cashTransactions||[]).map((t,index)=>({t,index,id:String(t.id||`cash:${index}`)})).filter(x=>Number(x.t.amount)>0&&x.t.cashflow_type!=='INCOME_SALARY').map(x=>{const total=Math.abs(Number(x.t.amount)||0),allocated=allocatedFromIncome(st,x.id);return{...x,total,remaining:total-allocated}}).filter(x=>x.remaining>0).sort((a,b)=>String(b.t.date||'').localeCompare(String(a.t.date||''))).slice(0,250)
  }

  function ensureUi(){
    if($('reimbursementCardV35'))return true;
    const grid=document.querySelector('#imports .grid');if(!grid)return false;
    const card=document.createElement('div');card.id='reimbursementCardV35';card.className='card full';
    card.innerHTML=`<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap"><div><div class="title" style="margin-bottom:3px">立替・精算 <span class="tag">Phase 4</span></div><div class="tiny">元支出と精算入金を紐付け、総支出 − 精算 = 実質家計負担を管理します。</div></div><button class="btn secondary" id="refreshReimbursementV35">再読込</button></div><div id="reimbursementSummaryV35" class="form" style="margin-top:12px"></div><div class="card" style="margin-top:12px;padding:12px"><div class="title">精算を紐付け</div><div class="form" style="grid-template-columns:2fr 2fr 1fr auto"><div class="field"><label>元支出</label><select id="reimbursementExpenseV35"></select></div><div class="field"><label>精算入金</label><select id="reimbursementIncomeV35"></select></div><div class="field"><label>充当額</label><input id="reimbursementAmountV35" type="number" min="0" step="1"></div><div class="field" style="justify-content:flex-end"><button class="btn" id="addReimbursementV35">紐付け</button></div></div><div class="tiny" id="reimbursementHintV35" style="margin-top:8px"></div></div><div id="reimbursementRowsV35" style="margin-top:12px"></div>`;
    const anchor=$('expenseScopeCardV34');if(anchor&&anchor.parentElement===grid)anchor.after(card);else grid.appendChild(card);
    $('refreshReimbursementV35').onclick=render;
    $('reimbursementExpenseV35').onchange=syncSuggestedAmount;
    $('reimbursementIncomeV35').onchange=syncSuggestedAmount;
    $('addReimbursementV35').onclick=addLink;
    card.addEventListener('click',e=>{const b=e.target.closest?.('[data-unlink-reimbursement]');if(!b)return;removeLink(b.dataset.unlinkReimbursement)});
    return true;
  }
  function optionLabel(x){return `${x.date||''} · ${x.name} · ${yen(x.remaining)}残 · ${x.scope||''}`}
  function renderSelectors(st){
    const expenses=expenseCandidates(st),income=reimbursementCandidates(st),es=$('reimbursementExpenseV35'),rs=$('reimbursementIncomeV35');if(!es||!rs)return;
    const prevE=es.value,prevR=rs.value;
    es.innerHTML=expenses.length?expenses.map(x=>`<option value="${esc(x.ref.kind+'|'+x.ref.id)}">${esc(optionLabel(x))}</option>`).join(''):'<option value="">未精算の支出なし</option>';
    rs.innerHTML=income.length?income.map(x=>`<option value="${esc(x.id)}">${esc(`${x.t.date||''} · ${reimbursementName(x.t)} · ${yen(x.remaining)}残`)}</option>`).join(''):'<option value="">精算候補の入金なし</option>';
    if([...es.options].some(o=>o.value===prevE))es.value=prevE;if([...rs.options].some(o=>o.value===prevR))rs.value=prevR;syncSuggestedAmount();
  }
  function selectedExpense(st){const v=$('reimbursementExpenseV35')?.value||'',p=v.indexOf('|');if(p<0)return null;const ref={kind:v.slice(0,p),id:v.slice(p+1)},e=findExpense(st,ref);if(!e)return null;const gross=expenseAmount(e.kind,e.obj),remaining=gross-allocatedForExpense(st,ref);return{ref,...e,gross,remaining}}
  function selectedIncome(st){const id=$('reimbursementIncomeV35')?.value||'',r=findCash(st,id);if(!r)return null;const total=Math.abs(Number(r.obj.amount)||0),remaining=total-allocatedFromIncome(st,id);return{id,...r,total,remaining}}
  function syncSuggestedAmount(){const st=stateNow(),e=selectedExpense(st),r=selectedIncome(st),input=$('reimbursementAmountV35'),hint=$('reimbursementHintV35');if(!input||!hint)return;if(!e||!r){input.value='';hint.textContent='元支出と精算入金を選択してください。';return}const suggested=Math.max(0,Math.min(e.remaining,r.remaining));input.value=String(Math.round(suggested));hint.textContent=`支出残 ${yen(e.remaining)} / 入金未充当 ${yen(r.remaining)}。必要なら一部だけ充当できます。`}
  function addLink(){
    const st=stateNow();ensureState(st);const e=selectedExpense(st),r=selectedIncome(st),amount=Math.abs(Number($('reimbursementAmountV35')?.value)||0);if(!e||!r||amount<=0){alert('元支出・精算入金・充当額を確認してください。');return}if(amount>e.remaining){alert(`元支出の未精算額 ${yen(e.remaining)} を超えています。`);return}if(amount>r.remaining){alert(`精算入金の未充当額 ${yen(r.remaining)} を超えています。`);return}
    st.reimbursementLinks.push({id:`reim:${crypto.randomUUID()}`,expense_event:{kind:e.ref.kind,id:e.ref.id},reimbursement_event:{kind:'cash',id:r.id},expense_ref:e.ref,reimbursement_ref:{kind:'cash',id:r.id},gross_expense:e.gross,reimbursement_amount:amount,net_household_cost:e.remaining-amount,created_at:new Date().toISOString(),source:'manual'});persist(st);render();
  }
  function removeLink(id){const st=stateNow();ensureState(st);const link=st.reimbursementLinks.find(x=>x.id===id);if(!link)return;if(!confirm('この精算リンクを解除しますか？'))return;st.reimbursementLinks=st.reimbursementLinks.filter(x=>x.id!==id);persist(st);render()}

  function summary(st){let gross=0,reimb=0,net=0;const seen=new Set();for(const l of st.reimbursementLinks||[]){const key=`${l.expense_ref?.kind}|${l.expense_ref?.id}`;if(!seen.has(key)){const e=findExpense(st,l.expense_ref||{});if(e){gross+=expenseAmount(e.kind,e.obj);seen.add(key)}}reimb+=Math.abs(Number(l.reimbursement_amount)||0)}net=gross-reimb;return{gross,reimb,net,count:(st.reimbursementLinks||[]).length}}
  function renderRows(st){const box=$('reimbursementRowsV35');if(!box)return;const rows=[...(st.reimbursementLinks||[])].sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));box.innerHTML=rows.length?rows.map(l=>{const e=findExpense(st,l.expense_ref||{}),r=findCash(st,l.reimbursement_ref?.id),gross=e?expenseAmount(e.kind,e.obj):Number(l.gross_expense)||0,allocated=e?allocatedForExpense(st,l.expense_ref):Math.abs(Number(l.reimbursement_amount)||0),net=gross-allocated;return`<div class="card" style="padding:12px;margin-top:8px"><div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><div><b>${esc(e?expenseName(e.kind,e.obj):'元支出不明')}</b><div class="tiny">${esc(e?expenseDate(e.kind,e.obj):'')} · 総支出 ${yen(gross)}</div></div><button class="btn danger" data-unlink-reimbursement="${esc(l.id)}">解除</button></div><div class="row"><span>精算入金</span><span>${esc(r?reimbursementName(r.obj):'入金明細不明')} · <b class="good">+${yen(l.reimbursement_amount)}</b></span></div><div class="row"><span>この支出の累計精算</span><b>${yen(allocated)}</b></div><div class="row"><span>実質家計負担</span><b class="${net>0?'warn':'good'}">${yen(net)}</b></div></div>`}).join(''):'<div class="note">まだ立替・精算リンクはありません。元支出と実際の入金明細を選んで紐付けます。</div>'}
  function render(){if(!ensureUi())return;const st=stateNow();ensureState(st);recalc(st);const s=summary(st);$('reimbursementSummaryV35').innerHTML=[['紐付け支出総額',s.gross],['精算済み',s.reimb],['実質家計負担',s.net],['リンク',s.count]].map(([k,v],i)=>`<div><span class="muted">${k}</span><b style="display:block;font-size:19px;margin-top:5px">${i===3?v+'件':yen(v)}</b></div>`).join('');renderSelectors(st);renderRows(st)}
  function queue(){clearTimeout(renderTimer);renderTimer=setTimeout(render,80)}
  function boot(){const st=stateNow();ensureState(st);recalc(st);ensureUi();render();document.addEventListener('click',e=>{if(e.target.closest?.('[data-page="imports"]'))setTimeout(render,0)});window.addEventListener('focus',queue);window.renderReimbursementV35=render;window.householdNetCostForExpense=(kind,id)=>{const s=stateNow(),e=findExpense(s,{kind,id});return e?expenseAmount(kind,e.obj)-allocatedForExpense(s,{kind,id}):null}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
})();