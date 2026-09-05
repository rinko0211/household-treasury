(() => {
  const CARD_ID='bonusAllocationCardV58';
  const DASH_ID='bonusDashboardV58';
  const PLAN_MODAL='bonusPlanModalV58';
  const ALLOC_MODAL='bonusAllocModalV58';
  const GUARD_KEY='householdTreasuryBonusGuardV58';
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const yen=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
  const norm=s=>String(s??'').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/\.]/g,'').toUpperCase();
  const clone=o=>structuredClone(o||{});
  const stateNow=()=> (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{};
  const iso=d=>{const x=new Date(d);return Number.isNaN(x.getTime())?'':`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`};
  let busy=false,timer=null,editingPlanId=null,allocPlanId=null,editingAllocId=null;

  function time(v){const n=Date.parse(v||'');return Number.isFinite(n)?n:0}
  function bonusComparable(st){return JSON.stringify(st?.bonusPlans||[])}
  function readGuard(){try{return JSON.parse(localStorage.getItem(GUARD_KEY)||'null')}catch{return null}}
  function writeGuard(st,reason='local'){
    try{localStorage.setItem(GUARD_KEY,JSON.stringify({version:1,savedAt:st.bonusPlansUpdatedAt||new Date().toISOString(),reason,bonusPlans:clone(st.bonusPlans||[])}))}catch{}
  }
  function ensureShape(st){
    st.bonusPlans=Array.isArray(st.bonusPlans)?st.bonusPlans:[];
    for(const p of st.bonusPlans){p.allocations=Array.isArray(p.allocations)?p.allocations:[];if(!p.id)p.id=`bonus:${crypto.randomUUID()}`}
    return st;
  }

  const previousReplace=window.replaceTreasuryState;
  if(typeof previousReplace==='function'&&!window.__bonusGuardV58Wrapped){
    window.__bonusGuardV58Wrapped=true;
    window.replaceTreasuryState=function replaceTreasuryStateV58(next){
      if(busy)return previousReplace(next);
      next=clone(next||{});ensureShape(next);
      const cur=stateNow();ensureShape(cur);
      const different=bonusComparable(cur)!==bonusComparable(next);
      const remote=!!window.__treasuryApplyingRemote,restoring=!!window.__treasuryRecoveryRestoring;
      if(remote&&!restoring&&different&&cur.bonusPlans.length){
        const guard=readGuard(),curTs=Math.max(time(cur.bonusPlansUpdatedAt),time(guard?.savedAt)),nextTs=time(next.bonusPlansUpdatedAt);
        if(curTs>nextTs){next.bonusPlans=clone(cur.bonusPlans);next.bonusPlansUpdatedAt=cur.bonusPlansUpdatedAt||guard?.savedAt||new Date().toISOString()}
      }else if(!remote&&!restoring&&different){next.bonusPlansUpdatedAt=new Date().toISOString()}
      const out=previousReplace(next);const after=stateNow();ensureShape(after);writeGuard(after,'after-replace');return out;
    };
  }

  function isBonusEvent(e){
    if(Number(e?.amount)<=0)return false;
    const s=norm(`${e?.name||''} ${e?.type||''} ${e?.future_kind||''} ${e?.note||''}`);
    return /BONUS|ボーナス|賞与|期末勤勉|勤勉手当/.test(s);
  }
  function bonusEvents(st){return (st.events||[]).filter(isBonusEvent)}
  function syncAutoPlans(st){
    ensureShape(st);let changed=false;
    for(const e of bonusEvents(st)){
      const id=`bonus-event:${e.id}`,amount=Math.max(0,Number(e.amount)||0);let p=st.bonusPlans.find(x=>String(x.source_event_id||'')===String(e.id)||String(x.id)===id);
      if(!p){p={id,source_event_id:e.id,name:e.name||'ボーナス',date:e.date||'',expected_amount:amount,allocations:[],autoCreated:true,createdAt:new Date().toISOString()};st.bonusPlans.push(p);changed=true}
      const patch={source_event_id:e.id,name:e.name||p.name||'ボーナス',date:e.date||p.date||'',expected_amount:amount,autoCreated:true};
      for(const [k,v] of Object.entries(patch))if(p[k]!==v){p[k]=v;changed=true}
    }
    return changed;
  }
  function autoAllocations(st,plan){
    const month=Number(String(plan.date||'').slice(5,7));if(!month)return[];const out=[];
    for(const m of st.masters?.fixedExpenses||[]){
      if(m.active===false||String(m.cadence||'').toUpperCase()!=='ANNUAL')continue;
      for(const b of Array.isArray(m.bonusAllocations)?m.bonusAllocations:[]){
        if(Number(b.month)!==month||!(Number(b.amount)>0))continue;
        out.push({id:`auto:${m.id}:${month}`,label:m.name||'年払い',amount:Number(b.amount),target_type:'FIXED_MASTER',target_id:m.id,automatic:true});
      }
    }
    return out;
  }
  function planMetrics(st,p){
    const automatic=autoAllocations(st,p),manual=p.allocations||[],reserved=[...automatic,...manual].reduce((a,x)=>a+Math.max(0,Number(x.amount)||0),0),expected=Math.max(0,Number(p.expected_amount)||0);return{automatic,manual,reserved,expected,free:expected-reserved}
  }
  function upcomingPlans(st){const now=iso(new Date());return [...(st.bonusPlans||[])].filter(p=>!p.date||String(p.date)>=now.slice(0,7)+'-01').sort((a,b)=>String(a.date||'9999').localeCompare(String(b.date||'9999')))}

  function persist(st,msg){
    if(busy)return;busy=true;try{ensureShape(st);st.bonusPlansUpdatedAt=new Date().toISOString();writeGuard(st,msg);window.treasuryRecoverySnapshot?.(`${msg}直前`);window.replaceTreasuryState?.(st);window.setTreasurySaveStatus?.(`${msg}・同期中`);window.cloudSyncOnLocalSave?.()}finally{setTimeout(()=>busy=false,0)}
    setTimeout(renderAll,0);
  }

  function ensurePlanModal(){
    if($(PLAN_MODAL))return;const m=document.createElement('div');m.id=PLAN_MODAL;m.className='hidden';m.innerHTML=`<div style="position:fixed;inset:0;background:#0009;z-index:10200" data-b58-close-plan></div><div class="card" style="position:fixed;z-index:10201;left:50%;top:50%;transform:translate(-50%,-50%);width:min(94vw,560px);max-height:90vh;overflow:auto"><div class="title" id="b58PlanTitle">ボーナス計画</div><div class="form" style="grid-template-columns:1fr 1fr"><div class="field"><label>予定日</label><input id="b58PlanDate" type="date"></div><div class="field"><label>予定額</label><input id="b58PlanAmount" type="number" min="0"></div><div class="field" style="grid-column:1/-1"><label>名称</label><input id="b58PlanName" placeholder="例：冬ボーナス"></div></div><div class="tiny" style="margin-top:8px">未来予定にボーナスを登録している場合は自動で計画が作られます。ここは未登録のボーナス用です。</div><div class="controls" style="margin-top:12px"><button class="btn" id="b58PlanSave">保存</button><button class="btn secondary" id="b58PlanCancel">キャンセル</button></div></div>`;document.body.appendChild(m);m.querySelector('[data-b58-close-plan]').onclick=closePlanModal;$('b58PlanCancel').onclick=closePlanModal;$('b58PlanSave').onclick=savePlan;
  }
  function openPlanModal(id=''){ensurePlanModal();const st=stateNow(),p=id?(st.bonusPlans||[]).find(x=>String(x.id)===String(id)):null;if(p?.autoCreated)return;editingPlanId=p?.id||null;$('b58PlanTitle').textContent=p?'ボーナス計画を編集':'ボーナス計画を追加';$('b58PlanDate').value=p?.date||iso(new Date());$('b58PlanAmount').value=p?.expected_amount??'';$('b58PlanName').value=p?.name||'';$(PLAN_MODAL).classList.remove('hidden')}
  function closePlanModal(){$(PLAN_MODAL)?.classList.add('hidden');editingPlanId=null}
  function savePlan(){const date=$('b58PlanDate').value,name=$('b58PlanName').value.trim(),amount=Number($('b58PlanAmount').value);if(!date||!name||!Number.isFinite(amount)||amount<0)return alert('日付・名称・予定額を確認してください。');const st=stateNow();ensureShape(st);let p=editingPlanId?st.bonusPlans.find(x=>String(x.id)===String(editingPlanId)):null;if(!p){p={id:`bonus:${crypto.randomUUID()}`,allocations:[],createdAt:new Date().toISOString(),autoCreated:false};st.bonusPlans.push(p)}Object.assign(p,{name,date,expected_amount:amount,updatedAt:new Date().toISOString()});persist(st,'ボーナス計画保存');closePlanModal()}

  function targetOptions(st,selected='CUSTOM:'){
    const opts=[['CUSTOM:','予約のみ']];
    for(const x of st.masters?.fixedExpenses||[])if(x.active!==false)opts.push([`FIXED_MASTER:${x.id}`,`固定費: ${x.name}`]);
    for(const x of st.masters?.liabilities||[])if(x.active!==false)opts.push([`LIABILITY:${x.id}`,`負債: ${x.name}`]);
    for(const x of st.events||[])if(Number(x.amount)<0)opts.push([`EVENT:${x.id}`,`予定: ${x.name}`]);
    return opts.map(([v,l])=>`<option value="${esc(v)}" ${v===selected?'selected':''}>${esc(l)}</option>`).join('')
  }
  function targetRecord(st,val){const [type,id='']=String(val||'CUSTOM:').split(':');if(type==='FIXED_MASTER')return(st.masters?.fixedExpenses||[]).find(x=>String(x.id)===id);if(type==='LIABILITY')return(st.masters?.liabilities||[]).find(x=>String(x.id)===id);if(type==='EVENT')return(st.events||[]).find(x=>String(x.id)===id);return null}
  function ensureAllocModal(){
    if($(ALLOC_MODAL))return;const m=document.createElement('div');m.id=ALLOC_MODAL;m.className='hidden';m.innerHTML=`<div style="position:fixed;inset:0;background:#0009;z-index:10210" data-b58-close-alloc></div><div class="card" style="position:fixed;z-index:10211;left:50%;top:50%;transform:translate(-50%,-50%);width:min(94vw,620px);max-height:90vh;overflow:auto"><div class="title" id="b58AllocTitle">使途を予約</div><div class="form" style="grid-template-columns:1fr 1fr"><div class="field" style="grid-column:1/-1"><label>紐付け先</label><select id="b58AllocTarget"></select></div><div class="field"><label>使途名</label><input id="b58AllocLabel"></div><div class="field"><label>予約額</label><input id="b58AllocAmount" type="number" min="0"></div><div class="field" style="grid-column:1/-1"><label>メモ</label><input id="b58AllocNote" placeholder="任意"></div></div><div class="tiny" style="margin-top:8px">予約はCash Flowの支出を増やしません。既存の固定費・未来予定に紐付けても二重計上しません。</div><div class="controls" style="margin-top:12px"><button class="btn" id="b58AllocSave">保存</button><button class="btn secondary" id="b58AllocCancel">キャンセル</button></div></div>`;document.body.appendChild(m);m.querySelector('[data-b58-close-alloc]').onclick=closeAllocModal;$('b58AllocCancel').onclick=closeAllocModal;$('b58AllocSave').onclick=saveAllocation;$('b58AllocTarget').onchange=allocationTargetChanged;
  }
  function openAllocModal(planId,allocId=''){ensureAllocModal();const st=stateNow(),p=(st.bonusPlans||[]).find(x=>String(x.id)===String(planId));if(!p)return;const a=allocId?(p.allocations||[]).find(x=>String(x.id)===String(allocId)):null;allocPlanId=planId;editingAllocId=a?.id||null;const selected=a?`${a.target_type||'CUSTOM'}:${a.target_id||''}`:'CUSTOM:';$('b58AllocTarget').innerHTML=targetOptions(st,selected);$('b58AllocLabel').value=a?.label||'';$('b58AllocAmount').value=a?.amount??'';$('b58AllocNote').value=a?.note||'';$('b58AllocTitle').textContent=a?'使途予約を編集':'使途を予約';$(ALLOC_MODAL).classList.remove('hidden')}
  function closeAllocModal(){$(ALLOC_MODAL)?.classList.add('hidden');allocPlanId=null;editingAllocId=null}
  function allocationTargetChanged(){const st=stateNow(),r=targetRecord(st,$('b58AllocTarget').value);if(!r)return;$('b58AllocLabel').value=r.name||$('b58AllocLabel').value;const amt=Math.abs(Number(r.amount??r.balance??r.referenceBalance)||0);if(amt)$('b58AllocAmount').value=amt}
  function saveAllocation(){const target=$('b58AllocTarget').value||'CUSTOM:',[type,id='']=target.split(':'),label=$('b58AllocLabel').value.trim(),amount=Number($('b58AllocAmount').value),note=$('b58AllocNote').value.trim();if(!label||!Number.isFinite(amount)||amount<0)return alert('使途名・予約額を確認してください。');const st=stateNow(),p=(st.bonusPlans||[]).find(x=>String(x.id)===String(allocPlanId));if(!p)return;p.allocations=Array.isArray(p.allocations)?p.allocations:[];let a=editingAllocId?p.allocations.find(x=>String(x.id)===String(editingAllocId)):null;if(!a){a={id:`alloc:${crypto.randomUUID()}`,createdAt:new Date().toISOString()};p.allocations.push(a)}Object.assign(a,{label,amount,target_type:type||'CUSTOM',target_id:id||null,note,updatedAt:new Date().toISOString()});p.updatedAt=new Date().toISOString();persist(st,'ボーナス使途予約保存');closeAllocModal()}
  function deleteAllocation(planId,allocId){const st=stateNow(),p=(st.bonusPlans||[]).find(x=>String(x.id)===String(planId));if(!p)return;const a=(p.allocations||[]).find(x=>String(x.id)===String(allocId));if(!a||!confirm(`「${a.label}」の予約を削除しますか？`))return;p.allocations=p.allocations.filter(x=>String(x.id)!==String(allocId));p.updatedAt=new Date().toISOString();persist(st,'ボーナス使途予約削除')}
  function deletePlan(id){const st=stateNow(),p=(st.bonusPlans||[]).find(x=>String(x.id)===String(id));if(!p||p.autoCreated)return;if(!confirm(`「${p.name}」を削除しますか？`))return;st.bonusPlans=st.bonusPlans.filter(x=>String(x.id)!==String(id));persist(st,'ボーナス計画削除')}

  function allocationRow(a,planId){return `<div class="row"><div style="min-width:0"><b>${esc(a.label||'予約')}</b><div class="tiny">${a.automatic?'年払いマスタから自動予約':a.target_type&&a.target_type!=='CUSTOM'?`紐付け: ${esc(a.target_type)}`:'手動予約'}${a.note?` · ${esc(a.note)}`:''}</div></div><div class="controls"><b class="amt">${yen(a.amount)}</b>${a.automatic?'':`<button class="btn secondary" data-b58-edit-alloc="${esc(planId)}:${esc(a.id)}">編集</button><button class="btn danger" data-b58-del-alloc="${esc(planId)}:${esc(a.id)}">削除</button>`}</div></div>`}
  function planHtml(st,p){const m=planMetrics(st,p),all=[...m.automatic,...m.manual],klass=m.free<0?'bad':m.free===0?'warn':'good';return `<details class="card" style="padding:12px;margin-top:8px" data-b58-plan="${esc(p.id)}"><summary style="cursor:pointer"><div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><div><b>${esc(p.name||'ボーナス')}</b><div class="tiny">${esc(p.date||'日付未定')} · ${p.autoCreated?'未来予定連動':'手動計画'}</div></div><div style="text-align:right"><b>${yen(m.expected)}</b><div class="tiny ${klass}">自由 ${yen(m.free)}</div></div></div></summary><div class="form" style="margin-top:10px"><div><span class="muted">予定額</span><b style="display:block;font-size:19px">${yen(m.expected)}</b></div><div><span class="muted">予約済み</span><b style="display:block;font-size:19px">${yen(m.reserved)}</b></div><div><span class="muted">自由枠</span><b class="${klass}" style="display:block;font-size:19px">${yen(m.free)}</b></div></div><div style="margin-top:8px">${all.length?all.map(a=>allocationRow(a,p.id)).join(''):'<div class="muted">まだ使途予約はありません。</div>'}</div><div class="controls" style="margin-top:10px;flex-wrap:wrap"><button class="btn" data-b58-add-alloc="${esc(p.id)}">＋使途を予約</button>${p.autoCreated?'':`<button class="btn secondary" data-b58-edit-plan="${esc(p.id)}">計画を編集</button><button class="btn danger" data-b58-del-plan="${esc(p.id)}">計画を削除</button>`}</div></details>`}
  function ensureCashUi(){if($(CARD_ID))return true;const grid=document.querySelector('#cashflow .grid');if(!grid)return false;const c=document.createElement('div');c.id=CARD_ID;c.className='card full';c.innerHTML=`<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap"><div><div class="title" style="margin-bottom:3px">ボーナス使途予約 <span class="tag">v58</span></div><div class="tiny">ボーナスの予定額から、すでに使えない額と自由枠を分けます。予約は支出ではないのでCash Flowへ二重計上しません。</div></div><button class="btn secondary" id="b58AddPlan">＋ボーナス計画</button></div><div id="b58Rows" style="margin-top:10px"></div>`;const fp=$('futurePlannerCardV37');if(fp&&fp.parentElement===grid)fp.after(c);else grid.appendChild(c);$('b58AddPlan').onclick=()=>openPlanModal();c.addEventListener('click',cashClick);return true}
  function cashClick(e){const add=e.target.closest?.('[data-b58-add-alloc]');if(add)return openAllocModal(add.dataset.b58AddAlloc);const ep=e.target.closest?.('[data-b58-edit-plan]');if(ep)return openPlanModal(ep.dataset.b58EditPlan);const dp=e.target.closest?.('[data-b58-del-plan]');if(dp)return deletePlan(dp.dataset.b58DelPlan);const ea=e.target.closest?.('[data-b58-edit-alloc]');if(ea){const [p,a]=ea.dataset.b58EditAlloc.split(':alloc:');return openAllocModal(p,`alloc:${a}`)}const da=e.target.closest?.('[data-b58-del-alloc]');if(da){const [p,a]=da.dataset.b58DelAlloc.split(':alloc:');return deleteAllocation(p,`alloc:${a}`)}}
  function renderCash(){if(!ensureCashUi())return;const st=stateNow(),rows=[...(st.bonusPlans||[])].sort((a,b)=>String(a.date||'9999').localeCompare(String(b.date||'9999')));$('b58Rows').innerHTML=rows.length?rows.map(p=>planHtml(st,p)).join(''):'<div class="note">未来予定に「ボーナス」または「賞与」の収入を登録すると自動で計画ができます。手動追加もできます。</div>'}

  function ensureDashUi(){if($(DASH_ID))return true;const phase=$('dashboardPhase8V39');if(!phase)return false;const inner=phase.querySelector('.grid');if(!inner)return false;const c=document.createElement('div');c.id=DASH_ID;c.className='card half';c.innerHTML='<div class="title">ボーナス使途</div><div id="b58DashRows"></div>';inner.appendChild(c);c.addEventListener('click',e=>{if(e.target.closest('[data-b58-go]'))document.querySelector('[data-page="cashflow"]')?.click()});return true}
  function renderDash(){if(!ensureDashUi())return;const st=stateNow(),plans=upcomingPlans(st).slice(0,2),host=$('b58DashRows');if(!host)return;host.innerHTML=plans.length?plans.map(p=>{const m=planMetrics(st,p),klass=m.free<0?'bad':m.free===0?'warn':'good';return `<div class="row"><div><b>${esc(p.name||'ボーナス')}</b><div class="tiny">${esc(p.date||'')} · 予約 ${yen(m.reserved)}</div></div><div style="text-align:right"><b>${yen(m.expected)}</b><div class="tiny ${klass}">自由 ${yen(m.free)}</div></div></div>`}).join('')+'<div class="controls" style="margin-top:8px"><button class="btn secondary" data-b58-go>使途を管理</button></div>':'<div class="muted">今後のボーナス計画はありません。</div>'}

  function renderAll(){renderCash();renderDash()}
  function syncAndRender(){const st=stateNow();ensureShape(st);if(syncAutoPlans(st)){persist(st,'ボーナス予定連動更新');return}renderAll()}
  function queue(){clearTimeout(timer);timer=setTimeout(syncAndRender,100)}
  function boot(){const st=stateNow();ensureShape(st);if(st.bonusPlans.length)writeGuard(st,'v58-boot');ensurePlanModal();ensureAllocModal();syncAndRender();const body=$('eventsBody');if(body){new MutationObserver(queue).observe(body,{childList:true,subtree:true})}document.addEventListener('click',e=>{if(e.target.closest?.('[data-page="cashflow"],[data-page="dashboard"]'))setTimeout(syncAndRender,0)});window.addEventListener('focus',queue);window.renderBonusAllocationV58=renderAll}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
})();