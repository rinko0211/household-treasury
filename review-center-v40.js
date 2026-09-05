(() => {
  const CARD_ID='reviewCenterCardV40';
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const norm=s=>String(s??'').normalize('NFKC').replace(/[\s　()（）［］\[\]・]/g,'').toUpperCase();
  const yen=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
  const stateNow=()=> (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{};
  const SCOPES=['NORMAL','SPECIAL','INVESTMENT','DEBT','TRANSFER'];
  let timer=null,observer=null,applying=false;

  function nameOf(kind,o){return kind==='purchase'?(o.merchant_raw||o.merchant_normalized||'カード利用'):(o.description_raw||o.description||'銀行明細')}
  function dateOf(kind,o){return kind==='purchase'?(o.purchase_date||''):(o.date||'')}
  function amountOf(kind,o){return kind==='purchase'?Math.abs(Number(o.original_amount)||0):Number(o.amount)||0}
  function sourceOf(kind,o){return kind==='purchase'?(o.card||o.source||'card'):(o.source||'bank')}
  function categoryOf(o){return String(o.category||o.cashflow_type||'UNKNOWN')}
  function scopeOf(o){const s=String(o.expense_scope||o.ordinary_or_special||'').toUpperCase();return SCOPES.includes(s)?s:'NORMAL'}
  function keyFor(kind,o){return `${kind}|${norm(nameOf(kind,o))}`}
  function directId(kind,o,index){return kind==='purchase'?String(o.purchase_id||`purchase:${index}`):String(o.id||`cash:${index}`)}

  function ensureState(st){if(!Array.isArray(st.reviewRules))st.reviewRules=[];if(!Array.isArray(st.reviewQueue))st.reviewQueue=[];if(!st.reviewCenterVersion)st.reviewCenterVersion=1}
  function persist(st,reason='要確認を更新'){
    if(applying)return;
    ensureState(st);window.treasuryRecoverySnapshot?.(reason+'直前');
    window.replaceTreasuryState?.(st);window.repairTreasuryBankBalances?.();window.setTreasurySaveStatus?.('要確認保存済み・同期中');window.cloudSyncOnLocalSave?.();
  }

  function findByRef(st,ref){
    if(!ref)return null;const arr=ref.kind==='purchase'?(st.purchaseEvents||[]):ref.kind==='cash'?(st.cashTransactions||[]):[];
    const index=arr.findIndex((o,i)=>directId(ref.kind,o,i)===String(ref.id));return index>=0?{kind:ref.kind,index,obj:arr[index]}:null;
  }
  function resolveQueueItem(st,q){
    for(const ref of [q?.transaction_ref,q?.ref]){const hit=findByRef(st,ref);if(hit)return hit}
    if(q?.purchase_id){const i=(st.purchaseEvents||[]).findIndex(x=>String(x.purchase_id)===String(q.purchase_id));if(i>=0)return{kind:'purchase',index:i,obj:st.purchaseEvents[i]}}
    if(q?.transaction_id||q?.cash_transaction_id){const id=q.transaction_id||q.cash_transaction_id,i=(st.cashTransactions||[]).findIndex(x=>String(x.id)===String(id));if(i>=0)return{kind:'cash',index:i,obj:st.cashTransactions[i]}}
    const qName=norm(q?.merchant||q?.description||''),qDate=String(q?.date||''),qSource=norm(q?.source||'');if(!qName)return null;
    const hits=[];
    (st.purchaseEvents||[]).forEach((o,index)=>{if(norm(nameOf('purchase',o))===qName&&(!qDate||dateOf('purchase',o)===qDate)&&(!qSource||norm(sourceOf('purchase',o))===qSource))hits.push({kind:'purchase',index,obj:o})});
    (st.cashTransactions||[]).forEach((o,index)=>{if(norm(nameOf('cash',o))===qName&&(!qDate||dateOf('cash',o)===qDate)&&(!qSource||norm(sourceOf('cash',o))===qSource))hits.push({kind:'cash',index,obj:o})});
    return hits.length===1?hits[0]:null;
  }

  function needsReview(kind,o){
    if(o.review_status==='RESOLVED'||o.review_resolved_by_rule)return false;
    const confidence=Number(o.confidence??1),cat=categoryOf(o);
    if(confidence<.7||cat==='UNKNOWN')return true;
    if(kind==='cash'&&Number(o.amount)<0&&!o.is_transfer&&cat==='CASH_WITHDRAWAL_UNCLASSIFIED')return true;
    return false;
  }
  function collect(st){
    ensureState(st);const rows=[],seen=new Set();
    const push=(r)=>{const k=r.target?`${r.target.kind}|${directId(r.target.kind,r.target.obj,r.target.index)}`:`queue|${r.queueIndex}`;if(seen.has(k))return;seen.add(k);rows.push({...r,key:k})};
    st.reviewQueue.forEach((q,queueIndex)=>{const target=resolveQueueItem(st,q);push({origin:'queue',queueIndex,q,target,date:target?dateOf(target.kind,target.obj):String(q.date||''),name:target?nameOf(target.kind,target.obj):(q.merchant||q.description||q.source||'要確認'),note:q.note||'',confidence:Number(q.confidence??target?.obj?.confidence??0)})});
    (st.purchaseEvents||[]).forEach((obj,index)=>{if(needsReview('purchase',obj))push({origin:'derived',target:{kind:'purchase',index,obj},date:dateOf('purchase',obj),name:nameOf('purchase',obj),note:'低信頼または未分類',confidence:Number(obj.confidence??0)})});
    (st.cashTransactions||[]).forEach((obj,index)=>{if(needsReview('cash',obj))push({origin:'derived',target:{kind:'cash',index,obj},date:dateOf('cash',obj),name:nameOf('cash',obj),note:'低信頼または未分類',confidence:Number(obj.confidence??0)})});
    return rows.sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,300);
  }

  function applyRememberedRules(st,{save=false}={}){
    ensureState(st);let changed=false,resolvedNames=new Set();
    const apply=(kind,o)=>{const rule=st.reviewRules.find(r=>r.active!==false&&r.kind===kind&&r.match_key===keyFor(kind,o));if(!rule)return;if(rule.category&&categoryOf(o)!==rule.category){o.category=rule.category;if(kind==='cash')o.cashflow_type=rule.category;changed=true}if(rule.expense_scope&&scopeOf(o)!==rule.expense_scope){o.expense_scope=rule.expense_scope;o.ordinary_or_special=rule.expense_scope;changed=true}if(Number(o.confidence??0)<1){o.confidence=1;changed=true}if(!o.review_resolved_by_rule){o.review_resolved_by_rule=rule.id;o.review_status='RESOLVED';changed=true}resolvedNames.add(norm(nameOf(kind,o)))};
    (st.purchaseEvents||[]).forEach(o=>apply('purchase',o));(st.cashTransactions||[]).forEach(o=>apply('cash',o));
    if(resolvedNames.size){const before=st.reviewQueue.length;st.reviewQueue=st.reviewQueue.filter(q=>!resolvedNames.has(norm(q.merchant||q.description||'')));if(st.reviewQueue.length!==before)changed=true}
    if(changed&&save){applying=true;try{window.replaceTreasuryState?.(st);window.repairTreasuryBankBalances?.();window.cloudSyncOnLocalSave?.()}finally{setTimeout(()=>applying=false,0)}}
    return changed;
  }

  function targetFromButton(st,b){return findByRef(st,{kind:b.dataset.reviewKind,id:b.dataset.reviewId})}
  function removeQueueMatches(st,target,rowName=''){
    const name=norm(target?nameOf(target.kind,target.obj):rowName),date=target?dateOf(target.kind,target.obj):'';
    st.reviewQueue=st.reviewQueue.filter(q=>{const qn=norm(q.merchant||q.description||'');if(!qn||qn!==name)return true;if(date&&q.date&&String(q.date)!==date)return true;return false})
  }
  function confirmTarget(st,target,rowName=''){
    if(target){target.obj.review_status='RESOLVED';target.obj.reviewed_at=new Date().toISOString();target.obj.reviewed_by='user';target.obj.confidence=1}removeQueueMatches(st,target,rowName);persist(st,'要確認を確認済みに変更');renderCenter();
  }
  function changeCategory(st,target){const current=categoryOf(target.obj),next=prompt('カテゴリ名',current);if(!next)return;target.obj.category=next.trim().toUpperCase();if(target.kind==='cash')target.obj.cashflow_type=target.obj.category;target.obj.confidence=1;target.obj.review_status='RESOLVED';target.obj.reviewed_at=new Date().toISOString();removeQueueMatches(st,target);persist(st,'要確認カテゴリ変更');renderCenter()}
  function changeScope(st,target,value){if(!SCOPES.includes(value))return;target.obj.expense_scope=value;target.obj.ordinary_or_special=value;target.obj.expense_scope_source='manual';target.obj.review_status='RESOLVED';target.obj.reviewed_at=new Date().toISOString();target.obj.confidence=1;removeQueueMatches(st,target);persist(st,'要確認支出区分変更');renderCenter()}
  function rememberRule(st,target){
    const category=categoryOf(target.obj),scope=scopeOf(target.obj),match_key=keyFor(target.kind,target.obj);let r=st.reviewRules.find(x=>x.kind===target.kind&&x.match_key===match_key);
    if(r)Object.assign(r,{category,expense_scope:scope,active:true,updated_at:new Date().toISOString()});else st.reviewRules.push({id:`review-rule:${crypto.randomUUID()}`,kind:target.kind,match_key,match_name:nameOf(target.kind,target.obj),category,expense_scope:scope,active:true,created_at:new Date().toISOString()});
    target.obj.confidence=1;target.obj.review_status='RESOLVED';target.obj.reviewed_at=new Date().toISOString();removeQueueMatches(st,target);applyRememberedRules(st);persist(st,'分類ルールを記憶');renderCenter();
  }
  function convertFixed(st,target){
    const o=target.obj,name=nameOf(target.kind,o),amount=Math.abs(amountOf(target.kind,o)),date=dateOf(target.kind,o),day=Math.max(1,Math.min(31,Number(String(date).slice(8,10))||1));if(!amount)return alert('金額を確認できません。');
    st.masters=st.masters||{};st.masters.fixedExpenses=Array.isArray(st.masters.fixedExpenses)?st.masters.fixedExpenses:[];st.rules=Array.isArray(st.rules)?st.rules:[];
    const nk=norm(name);if(!st.masters.fixedExpenses.some(x=>norm(x.name)===nk&&String(x.cadence).toUpperCase()==='MONTHLY'))st.masters.fixedExpenses.push({id:`fixed:${crypto.randomUUID()}`,name,amount,cadence:'MONTHLY',active:true,source:'review-center-v40',createdAt:new Date().toISOString()});
    if(!st.rules.some(x=>norm(x.name)===nk&&x.enabled!==false))st.rules.push({id:`rule:${crypto.randomUUID()}`,name,day,amount:-amount,type:'fixed',ordinary_or_special:scopeOf(o),expense_scope:scopeOf(o),enabled:true,source:'review-center-v40'});
    o.review_status='RESOLVED';o.reviewed_at=new Date().toISOString();o.confidence=1;removeQueueMatches(st,target);persist(st,'要確認を固定費化');renderCenter();try{render()}catch{}
  }

  function ensureUi(){
    if($(CARD_ID))return true;const grid=document.querySelector('#imports .grid');if(!grid)return false;
    const old=$('reviewQueue');if(old)old.style.display='none';
    const card=document.createElement('div');card.id=CARD_ID;card.className='card full';card.innerHTML=`<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap"><div><div class="title" style="margin-bottom:3px">要確認 <span class="tag">Phase 9</span></div><div class="tiny">低信頼・未分類だけを集約します。確信できない元明細には編集ボタンを出しません。</div></div><button class="btn secondary" id="refreshReviewCenterV40">再読込</button></div><div id="reviewCenterSummaryV40" class="form" style="margin-top:12px"></div><div id="reviewCenterRowsV40" style="margin-top:12px"></div>`;
    const summary=$('importSummary')?.closest?.('.card');if(summary&&summary.parentElement===grid)summary.after(card);else grid.appendChild(card);
    $('refreshReviewCenterV40').onclick=()=>{const st=stateNow();applyRememberedRules(st,{save:true});renderCenter()};
    card.addEventListener('click',e=>{const b=e.target.closest?.('[data-review-action]');if(!b)return;const st=stateNow(),action=b.dataset.reviewAction,target=targetFromButton(st,b);if(action==='confirm')return confirmTarget(st,target,b.dataset.reviewName||'');if(!target)return alert('元明細を一意に特定できないため、この操作はできません。');if(action==='category')return changeCategory(st,target);if(action==='remember')return rememberRule(st,target);if(action==='fixed')return convertFixed(st,target)});
    card.addEventListener('change',e=>{const s=e.target.closest?.('[data-review-scope]');if(!s)return;const st=stateNow(),target=targetFromButton(st,s);if(target)changeScope(st,target,s.value)});return true;
  }
  function rowHtml(r){
    const t=r.target,o=t?.obj,editable=!!t,id=editable?directId(t.kind,o,t.index):'',scope=editable?scopeOf(o):'',cat=editable?categoryOf(o):'—',amt=editable?amountOf(t.kind,o):null,source=editable?sourceOf(t.kind,o):(r.q?.source||'');
    const attrs=editable?`data-review-kind="${esc(t.kind)}" data-review-id="${esc(id)}"`:'';
    return `<div class="card" style="padding:12px;margin-top:8px"><div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><div style="min-width:0"><b>${esc(r.name)}</b><div class="tiny">${esc(r.date||'日付不明')} · ${esc(source)} · ${esc(cat)} · confidence ${Number(r.confidence||0).toFixed(2)}</div>${r.note?`<div class="tiny" style="margin-top:4px">${esc(r.note)}</div>`:''}</div>${amt!==null?`<b class="amt ${Number(amt)<0?'bad':''}">${yen(amt)}</b>`:''}</div>${editable?`<div class="controls" style="margin-top:10px;flex-wrap:wrap"><select data-review-scope ${attrs}>${SCOPES.map(x=>`<option value="${x}"${x===scope?' selected':''}>${x}</option>`).join('')}</select><button class="btn secondary" data-review-action="category" ${attrs}>カテゴリ変更</button><button class="btn secondary" data-review-action="remember" ${attrs}>同じ名称を記憶</button><button class="btn secondary" data-review-action="fixed" ${attrs}>固定費化</button><button class="btn" data-review-action="confirm" ${attrs}>確認済み</button></div>`:`<div class="note warn" style="margin-top:8px">元明細を一意に特定できません。内容を確認後、「確認済み」でキューだけ閉じられます。</div><div class="controls" style="margin-top:8px"><button class="btn" data-review-action="confirm" data-review-name="${esc(r.name)}">確認済み</button></div>`}</div>`;
  }
  function renderCenter(){
    if(!ensureUi())return;const st=stateNow();ensureState(st);const rows=collect(st),editable=rows.filter(x=>x.target).length,ambiguous=rows.length-editable;
    $('reviewCenterSummaryV40').innerHTML=[['要確認',rows.length+'件'],['明細編集可能',editable+'件'],['元明細不明',ambiguous+'件'],['記憶ルール',st.reviewRules.filter(x=>x.active!==false).length+'件']].map(([k,v])=>`<div><span class="muted">${k}</span><b style="display:block;font-size:19px;margin-top:5px">${v}</b></div>`).join('');
    $('reviewCenterRowsV40').innerHTML=rows.length?rows.map(rowHtml).join(''):'<div class="note"><b>要確認はありません。</b><br>通常運用ではここが空の状態を目標にします。</div>';
  }
  function queue(){clearTimeout(timer);timer=setTimeout(()=>{if(applying)return;const st=stateNow();applyRememberedRules(st,{save:true});renderCenter()},100)}
  function boot(){ensureUi();const st=stateNow();applyRememberedRules(st,{save:true});renderCenter();const target=$('importResults');if(target){observer=new MutationObserver(queue);observer.observe(target,{childList:true,subtree:true})}document.addEventListener('click',e=>{if(e.target.closest?.('[data-page="imports"]'))setTimeout(renderCenter,0)});window.addEventListener('focus',queue);window.renderReviewCenterV40=renderCenter}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
})();