/* v170 — budget-driven card settlements; personal household values never enter public source. */
(() => {
'use strict';
if(window.householdCardBudgetV170)return;
const FORMAT='HOUSEHOLD_TREASURY_CARD_BUDGET_PLAN_V170';
const KEYS=['rakuten','jal','dcard'];
const LABELS={rakuten:'楽天カード',jal:'JAL/DCカード',dcard:'dカード'};
const yen=x=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(x)||0);
const norm=s=>String(s||'').normalize('NFKC').replace(/[\s　()（）\[\]［］_\-\.／/]/g,'').toUpperCase();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const amount=(v,label)=>{const n=Number(v);if(!Number.isSafeInteger(n)||n<0||n>50000000)throw Error(label+'の金額が不正です');return n};
const stateNow=()=>{try{return (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{}}catch{return {}}};
let draft=null,loadedName='';
function keyOf(card){
 const a=norm(typeof card==='string'?card:card?.name||card?.importLabel);
 if(/RAKUTEN|楽天/.test(a))return 'rakuten';
 if(/JAL|MUFGDC/.test(a))return 'jal';
 if(a==='Dカード'||a==='DCARD'||a==='D'||/DOCOMO/.test(a))return 'dcard';
 return null;
}
function validated(raw){
 if(!raw||raw.format!==FORMAT||typeof raw.by_card!=='object'||!raw.by_card)
   throw Error('カード配分専用の設定JSONではありません');
 const value={
   format:FORMAT,
   family_daily_budget:amount(raw.family_daily_budget,'家族の日常生活費'),
   homecoming_card_budget:amount(raw.homecoming_card_budget,'カード払いの帰省費'),
   by_card:{},
   fixed_projection_overrides:{},fixed_card_assignments:{}
 };
 for(const k of KEYS)value.by_card[k]=amount(raw.by_card[k],LABELS[k]);
 if(raw.fixed_projection_overrides!==undefined){
  if(!raw.fixed_projection_overrides||Array.isArray(raw.fixed_projection_overrides)||
     typeof raw.fixed_projection_overrides!=='object')throw Error('固定費の予定額が不正です');
  for(const [id,v] of Object.entries(raw.fixed_projection_overrides)){
   if(!/^fx-[a-z0-9_-]+$/i.test(id))throw Error('固定費IDが不正です');
   value.fixed_projection_overrides[id]=amount(v,'固定費予定');
  }
 }
 if(raw.fixed_card_assignments!==undefined){
  if(!raw.fixed_card_assignments||Array.isArray(raw.fixed_card_assignments)||
     typeof raw.fixed_card_assignments!=='object')throw Error('固定費の支払先設定が不正です');
  for(const [id,k] of Object.entries(raw.fixed_card_assignments)){
   if(!/^fx-[a-z0-9_-]+$/i.test(id)||!['rakuten','jal','dcard','direct'].includes(k))
     throw Error('固定費の支払カード指定が不正です');
   value.fixed_card_assignments[id]=k;
  }
 }
 const expected=value.family_daily_budget+value.homecoming_card_budget;
 const supplied=KEYS.reduce((n,k)=>n+value.by_card[k],0);
 if(expected!==supplied)throw Error('3カードへの配分合計 '+yen(supplied)+' が、家族カード予算 '+yen(expected)+' と一致しません。これは支出の上限ではなく配分計算の整合確認です');
 return value;
}
function fixedCandidates(st,settings){
 const fixed=[];
 for(const x of st?.masters?.fixedExpenses||[]){
  const id=String(x.id||''),mode=String(x.cadence||'MONTHLY').toUpperCase();
  const eco=String(x.economic_type||'EXPENSE').toUpperCase();
  const scope=String(x.expense_scope||x.ordinary_or_special||'NORMAL').toUpperCase();
  if(!/^fx-[a-z0-9_-]+$/i.test(id)||x.active===false||x.forecastEnabled===false||
   mode!=='MONTHLY'||eco!=='EXPENSE'||scope!=='NORMAL')continue;
  const route=String(x.paymentRoute||x.payment_route||'DIRECT').toUpperCase();
  const masterCard=route==='CARD'?keyOf(x.paymentCard||x.card):null;
  const assigned=Object.hasOwn(settings.fixed_card_assignments||{},id)?
      settings.fixed_card_assignments[id]:(masterCard||'direct');
  const base=Math.max(0,Math.round(Number(x.amount)||0));
  const amount=Object.hasOwn(settings.fixed_projection_overrides||{},id)?
     settings.fixed_projection_overrides[id]:base;
  fixed.push({id,name:String(x.name||'月額固定費'),base,amount,assigned,masterCard});
 }
 return fixed;
}
function cardFixed(st,key,settings){
 const items=[],overrides=settings.fixed_projection_overrides||{},assignments=settings.fixed_card_assignments||{};
 for(const fx of st?.masters?.fixedExpenses||[]){
  const route=String(fx.paymentRoute||fx.payment_route||'DIRECT').toUpperCase();
  const cadence=String(fx.cadence||'MONTHLY').toUpperCase();
  const eco=String(fx.economic_type||'EXPENSE').toUpperCase();
  const scope=String(fx.expense_scope||fx.ordinary_or_special||'NORMAL').toUpperCase();
  if(fx.active===false||fx.forecastEnabled===false||cadence!=='MONTHLY'||
    eco!=='EXPENSE'||scope!=='NORMAL')continue;
  const id=String(fx.id||'');
  const planned=Object.hasOwn(assignments,id)?assignments[id]:(route==='CARD'?keyOf(fx.paymentCard||fx.card):null);
  if(planned!==key)continue;
  const raw=Number(fx.amount),future=Object.hasOwn(overrides,id);
  if(!Number.isFinite(raw)||raw<0)continue;
  const projected=future?overrides[id]:Math.round(raw);
  items.push({id,name:String(fx.name||'月額固定費'),amount:projected,masterAmount:Math.round(raw),future});
 }
 return {items,total:items.reduce((n,x)=>n+x.amount,0)};
}
function preview(st,settings){
 const p=validated(settings),cards=st?.masters?.cards||[],entries=KEYS.map(key=>{
  const hits=cards.filter(c=>c.active!==false&&keyOf(c)===key);
  const card=hits.length===1?hits[0]:null;
  const fixed=cardFixed(st,key,p);
  const monthly=p.by_card[key]+fixed.total;
  return {key,label:LABELS[key],card,ambiguous:hits.length>1,variable:p.by_card[key],
   fixed,total:monthly,fixedTotal:fixed.total,
   current:card?Math.max(0,Number(card.monthlyBaselineAmount??card.cardBaselineAmount??0)||0):null};
 });
 return {
   familyCard:p.family_daily_budget+p.homecoming_card_budget,
   variableTotal:KEYS.reduce((n,k)=>n+p.by_card[k],0),
   fixedTotal:entries.reduce((n,x)=>n+x.fixedTotal,0),
   total:entries.reduce((n,x)=>n+x.total,0),
   entries,settings:p
 };
}
function propose(st,settings,keys=KEYS){
 if(!Array.isArray(keys)||!keys.length||new Set(keys).size!==keys.length||
    keys.some(k=>!KEYS.includes(k)))throw Error('更新対象が不正です');
 const next=structuredClone(st),report=preview(next,settings),changes=[];
 next.masters=next.masters||{};
 for(const key of keys){
  const row=report.entries.find(x=>x.key===key);
  if(!row.card||row.ambiguous)throw Error(row.label+'のマスターが一意に見つかりません');
  const card=row.card;
  if(String(card.paymentMode||card.payment_mode||'FULL').toUpperCase()!=='FULL')
    throw Error(row.label+'がリボ設定中のため一括標準額へ変更しません');
  const beforeMode=String(card.forecastMode||card.forecast_mode||'').toUpperCase();
  if(row.current===row.total&&beforeMode==='BASELINE')continue;
  card.monthlyBaselineAmount=row.total;
  card.forecastMode='BASELINE';card.forecast_mode='BASELINE';
  card.baselineModeExplicitV88='BASELINE';card.baselineSource='USER_APPROVED_BUDGET_V170';
  card.baselineReviewedAt=new Date().toISOString();
  card.baselineFamilyAllocation=row.variable;card.baselineFixedComponent=row.fixedTotal;
  changes.push({key,name:row.label,before:row.current,after:row.total});
 }
 const previous=JSON.stringify(next.masters.cardBudgetPlanV170||null);
 const updated=JSON.stringify(report.settings);
 const planChanged=previous!==updated;
 if(changes.length||planChanged){
  next.masters.cardBudgetPlanV170=report.settings;
  next.masters.updatedAt=new Date().toISOString();
 }
 return {next,changes,planChanged,report};
}
function apply(settings,keys=KEYS){
 const latest=stateNow();
 if(!latest?.masters)throw Error('家計マスターを先に読み込んでください');
 const first=propose(latest,settings,keys);
 if(!first.changes.length&&!first.planChanged)return {changed:0};
 const details=first.changes.map(x=>x.name+'：'+yen(x.before)+' → '+yen(x.after)).join('\n');
 const confirmMessage='利用日ベースの消費ではなく、月次カード引落の予測基準を変更します。\n'+
  '家族カード配分：'+yen(first.report.variableTotal)+' / カード払い固定費：'+yen(first.report.fixedTotal)+
  ' / 引落予測：'+yen(first.report.total)+'\n'+details+
  '\n実際の請求・元明細・現金残高は変更しません。計画とマスターを保存しますか？';
 if(!window.confirm?.(confirmMessage))return {cancelled:true,changed:0};
 if(typeof window.treasuryRecoverySnapshot!=='function'||typeof window.replaceTreasuryState!=='function')
   throw Error('復旧・保存機能が利用できません');
 const final=propose(stateNow(),settings,keys);
 window.treasuryRecoverySnapshot('カード予算配分・標準引落見込を更新する直前（v170）');
 if(window.replaceTreasuryState(final.next)===false)throw Error('マスター保存に失敗しました');
 window.cloudSyncOnLocalSave?.();window.setTreasurySaveStatus?.('家族カード予算から標準引落を更新・同期中');
 window.householdCardSettingsV77?.render?.();window.renderPlanningUiV79?.();
 return {changed:final.changes.length,planChanged:final.planChanged};
}
function blank(){
 return {format:FORMAT,family_daily_budget:0,homecoming_card_budget:0,
  by_card:{rakuten:0,jal:0,dcard:0},fixed_projection_overrides:{},fixed_card_assignments:{}};
}
function readFields(root){
 const obj=draft?structuredClone(draft):blank();
 for(const key of ['family_daily_budget','homecoming_card_budget']){
  const inp=root.querySelector('[data-v170-field="'+key+'"]');if(inp)obj[key]=Number(inp.value);
 }
 for(const key of KEYS){
  const inp=root.querySelector('[data-v170-card="'+key+'"]');if(inp)obj.by_card[key]=Number(inp.value);
 }
 obj.fixed_card_assignments={...(obj.fixed_card_assignments||{})};
 obj.fixed_projection_overrides={...(obj.fixed_projection_overrides||{})};
 for(const inp of root.querySelectorAll('[data-v170-fixed-route]')){
   obj.fixed_card_assignments[inp.dataset.v170FixedRoute]=inp.value;
 }
 for(const inp of root.querySelectorAll('[data-v170-fixed-amount]')){
   obj.fixed_projection_overrides[inp.dataset.v170FixedAmount]=Number(inp.value);
 }
 return validated(obj);
}
const el=id=>document.getElementById(id);
function flash(message){const node=el('v170Status');if(node)node.textContent=message}
function redraw(){
 const root=el('cardBudgetPlannerV170');if(!root)return;
 const st=stateNow();
 if(!draft)draft=st?.masters?.cardBudgetPlanV170||blank();
 let p=null,error='';
 try{p=preview(st,draft)}catch(e){error=String(e.message||e)}
 const target=draft.family_daily_budget+draft.homecoming_card_budget;
 const distributed=KEYS.reduce((n,k)=>n+Number(draft.by_card[k]||0),0);
 const values=p?p.entries:KEYS.map(key=>({key,label:LABELS[key],variable:draft.by_card[key],fixedTotal:0,total:0,current:null,fixed:{items:[]},card:null}));
 root.innerHTML='<div class="treasury-panel-heading"><div><div class="treasury-eyebrow">BUDGET → PAYMENT PLAN</div>'+
 '<div class="title">カード引落標準額を家計予算から設計</div>'+
 '<p class="tiny">過去の請求平均ではなく、今後カードで払う家族費の配分＋各カード払い固定費から計算します。入力中はマスターを変更しません。反映ボタンで承認すると、設定値だけをマスターに保存・同期します。</p></div>'+
 '<div class="treasury-card-sum"><span>3カードの標準引落見込</span><b>'+(p?yen(p.total):'—')+'</b><small>／月</small></div></div>'+
 '<div class="form treasury-family-budget-form">'+
 '<div class="field"><label>家族の日常生活費（カード化する額）</label><input type="number" min="0" step="1000" data-v170-field="family_daily_budget" value="'+(draft.family_daily_budget||0)+'"></div>'+
 '<div class="field"><label>帰省など定期交通費（カード払い）</label><input type="number" min="0" step="1000" data-v170-field="homecoming_card_budget" value="'+(draft.homecoming_card_budget||0)+'"></div>'+
 '</div><div class="treasury-budget-check"><b>家族カード予算 '+yen(target)+'</b> → 3カード割当 '+yen(distributed)+
 (target===distributed?' <span class="good">一致</span>':' <span class="warn">差額 '+yen(target-distributed)+'</span>')+

 '</div><details class="treasury-card-fixed-config"><summary>固定費をカード別に割り当てる（今後の支払方法）</summary>'+
 '<p class="tiny">月々のマスター固定費を、今後どのカードで支払うか指定してください。ローン・現金・銀行引落は「カード払いなし」のままにします。予定金額だけの変更もできます。マスターの原額は変更しません。</p>'+
 (fixedCandidates(st,draft).length?fixedCandidates(st,draft).map(f=>
 '<div class="treasury-fixed-assign-row"><div><b>'+esc(f.name)+'</b><small>マスター '+yen(f.base)+'</small></div>'+
 '<label>予定月額 <input type="number" min="0" step="100" value="'+f.amount+'" data-v170-fixed-amount="'+esc(f.id)+'"></label>'+
 '<label>支払先 <select data-v170-fixed-route="'+esc(f.id)+'">'+
 [['direct','カード払いなし'],['rakuten','楽天'],['jal','JAL/DC'],['dcard','dカード']].map(([k,v])=>
 '<option value="'+k+'" '+(f.assigned===k?'selected':'')+'>'+v+'</option>').join('')+'</select></label></div>'
 ).join(''):'<p class="tiny">対象の月額固定費マスターはありません。</p>')+
 '</details><div class="treasury-baseline-grid">'+values.map(x=>
 '<article class="treasury-baseline-row"><div class="treasury-baseline-title"><b>'+x.label+'</b><span>配分案を編集</span></div>'+
 '<div class="field" style="width:100%;margin:13px 0 7px"><label>家族費の配分額</label><input type="number" min="0" step="1000" data-v170-card="'+x.key+'" value="'+x.variable+'"></div>'+
 '<div class="tiny">このカードで払う月額固定費：'+yen(x.fixedTotal)+'</div>'+
 '<div class="treasury-baseline-number">'+(p?yen(x.total):'—')+'</div>'+
 '<div class="tiny">マスターの現在額：'+(x.current===null?'未検出':yen(x.current))+'</div>'+
 '<div class="tiny">'+x.fixed.items.map(f=>esc(f.name)+' '+yen(f.amount)+(f.future?'（将来見込）':'')).join(' / ')+
 (!x.fixed.items.length?'登録済みカード固定費なし':'')+'</div>'+
 '<button type="button" class="btn secondary" data-v170-apply="'+x.key+'" '+(!p||!x.card||x.ambiguous?'disabled':'')+'>このカードに反映</button></article>').join('')+'</div>'+
 '<p class="tiny" style="margin-top:12px">家族の支出に厳格な上限を設けるものではありません。カード間の配分は暫定で、使い方が変われば毎月調整できます。実際にカード払いの固定費として登録されたものだけ別建てで足します。年払・ボーナス払・他社カードはここへ入れません。</p>'+
 '<div class="treasury-baseline-actions"><button type="button" class="btn" data-v170-apply="all" '+
 (!p||p.entries.some(x=>!x.card||x.ambiguous)?'disabled':'')+'>3カードをまとめてマスターに反映</button>'+
 '<button type="button" class="btn secondary" data-v170-file>家計配分の設定ファイルを読み込む</button>'+
 '<input id="v170PlanFile" type="file" accept="application/json,.json" hidden>'+
 '</div><div id="v170Status" class="tiny" role="status">'+(error?esc(error):(loadedName?'読込済み：'+esc(loadedName):'予算とカード別配分を入力してください。'))+'</div>';
}
function mount(){
 const grid=document.querySelector('#settings .grid');if(!grid)return false;
 let root=el('cardBudgetPlannerV170');if(!root){
   root=document.createElement('section');root.id='cardBudgetPlannerV170';
   root.className='card full treasury-baseline-panel';
   const existing=el('householdMasterCardV1');
   if(existing?.parentElement===grid)existing.after(root);else grid.prepend(root);
   root.addEventListener('click',e=>{
     if(e.target.closest?.('[data-v170-file]')){el('v170PlanFile')?.click();return}
     const btn=e.target.closest?.('[data-v170-apply]');if(!btn)return;
     try{
       const settings=readFields(root);
       const keys=btn.dataset.v170Apply==='all'?KEYS:[btn.dataset.v170Apply];
       const outcome=apply(settings,keys);
       if(!outcome.cancelled){draft=settings;redraw()}
       flash(outcome.cancelled?'変更を中止しました':
        outcome.changed||outcome.planChanged?'家計配分を保存し、カード標準見込を更新しました。':'変更はありません。');
     }catch(err){flash('未保存：'+String(err.message||err))}
   });
   root.addEventListener('change',async e=>{
     if(e.target.id==='v170PlanFile'){
       const file=e.target.files?.[0];if(!file)return;
       if(file.size>100000){flash('設定JSONは100KB以下にしてください');return}
       try{draft=validated(JSON.parse(await file.text()));loadedName=String(file.name||'').slice(0,90);redraw()}
       catch(err){flash('ファイルを読み込めません：'+String(err.message||err))}
       return;
     }
     if(e.target.matches?.('[data-v170-field], [data-v170-card], [data-v170-fixed-route], [data-v170-fixed-amount]')){
       const snapshot=structuredClone(draft||blank());
       for(const key of ['family_daily_budget','homecoming_card_budget']){
         const input=root.querySelector('[data-v170-field="'+key+'"]');if(input)snapshot[key]=Number(input.value);
       }
       for(const key of KEYS){const input=root.querySelector('[data-v170-card="'+key+'"]');if(input)snapshot.by_card[key]=Number(input.value)}
       snapshot.fixed_card_assignments={...(snapshot.fixed_card_assignments||{})};
       snapshot.fixed_projection_overrides={...(snapshot.fixed_projection_overrides||{})};
       for(const inp of root.querySelectorAll('[data-v170-fixed-route]'))snapshot.fixed_card_assignments[inp.dataset.v170FixedRoute]=inp.value;
       for(const inp of root.querySelectorAll('[data-v170-fixed-amount]'))snapshot.fixed_projection_overrides[inp.dataset.v170FixedAmount]=Number(inp.value);
       draft=snapshot;redraw();
     }
   });
 }
 redraw();return true;
}
window.householdCardBudgetV170={FORMAT,KEYS,LABELS,keyOf,validated,fixedCandidates,cardFixed,preview,propose,apply,mount,blank};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else setTimeout(mount,0);
window.addEventListener?.('treasury:pagechange',e=>{if(e.detail?.page==='settings')setTimeout(mount,0)});
})();
