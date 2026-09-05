(() => {
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const yen=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
  const stateNow=()=> (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{};
  const iso=d=>{const x=new Date(d);return Number.isNaN(x.getTime())?'':`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`};
  const todayIso=()=>iso(new Date());
  const norm=s=>String(s??'').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/]/g,'').toUpperCase();
  const VALID_SCOPE=new Set(['NORMAL','SPECIAL','INVESTMENT','DEBT','TRANSFER']);
  let timer=null,observer=null;

  function lastDay(y,m){return new Date(y,m,0).getDate()}
  function dateFor(y,m,d){return `${y}-${String(m).padStart(2,'0')}-${String(Math.min(Math.max(1,Number(d)||1),lastDay(y,m))).padStart(2,'0')}`}
  function addMonthsYm(ym,n){const [y,m]=ym.split('-').map(Number),d=new Date(y,m-1+n,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}
  function ymNow(){return todayIso().slice(0,7)}
  function monthDiff(a,b){const [ay,am]=a.split('-').map(Number),[by,bm]=b.split('-').map(Number);return(by-ay)*12+(bm-am)}
  function dueMonthOf(x){for(const v of [x?.dueMonth,x?.paymentMonth,x?.annualMonth,x?.month]){const n=Number(v);if(Number.isInteger(n)&&n>=1&&n<=12)return n}const s=String(x?.nextDueDate||x?.dueDate||'');const m=s.match(/^\d{4}-(\d{2})/);return m?Number(m[1]):null}
  function reservedOf(x){for(const v of [x?.reservedAmount,x?.reserved_amount,x?.reserveAmount])if(v!==null&&v!==''&&Number.isFinite(Number(v)))return Math.max(0,Number(v));return 0}
  function scopeOf(x){const s=String(x?.expense_scope||x?.ordinary_or_special||'NORMAL').toUpperCase();if(s==='ORDINARY')return'NORMAL';return VALID_SCOPE.has(s)?s:'NORMAL'}
  function activeFixed(st){return (st.masters?.fixedExpenses||[]).filter(x=>x.active!==false)}
  function legacyRuleFor(st,item){
    const direct=(st.rules||[]).filter(r=>String(r.source_master_id||r.master_id||'')===String(item.id));if(direct.length===1)return direct[0];
    const named=(st.rules||[]).filter(r=>norm(r.name)===norm(item.name));return named.length===1?named[0]:null;
  }
  function dueDayOf(st,item){for(const v of [item?.dueDay,item?.paymentDay,item?.day]){const n=Number(v);if(Number.isInteger(n)&&n>=1&&n<=31)return n}const r=legacyRuleFor(st,item),n=Number(r?.day);return Number.isInteger(n)&&n>=1&&n<=31?n:null}
  function forecastEnabled(item){return item.forecastEnabled!==false}
  function semiMonths(item){const raw=Array.isArray(item.activeMonths)?item.activeMonths:Array.isArray(item.months)?item.months:[];return [...new Set(raw.map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=12))].sort((a,b)=>a-b)}
  function bonusAllocations(item){
    const out=[];
    if(Array.isArray(item.bonusAllocations))for(const b of item.bonusAllocations){const month=Number(b?.month),amount=Number(b?.amount);if(month>=1&&month<=12&&amount>0)out.push({month,amount})}
    for(const i of [1,2]){const month=Number(item[`bonusMonth${i}`]),amount=Number(item[`bonusAmount${i}`]);if(month>=1&&month<=12&&amount>0&&!out.some(x=>x.month===month&&x.amount===amount))out.push({month,amount})}
    return out;
  }
  function annualTarget(item,fromYm=ymNow(),afterPaid=false){
    const dm=dueMonthOf(item);if(!dm)return null;const [fy,fm]=fromYm.split('-').map(Number);let y=dm<fm?fy+1:fy;const paid=Number(item.lastPaidYear)||0;if(!afterPaid&&paid>=y)y=paid+1;if(afterPaid&&y<=fy)y=fy+1;return{year:y,month:dm,ym:`${y}-${String(dm).padStart(2,'0')}`}
  }
  function annualPlanForCycle(item,startYm,targetYm,startReserved){
    const amount=Math.max(0,Number(item.amount)||0),shortage=Math.max(0,amount-Math.min(amount,Math.max(0,startReserved||0)));
    const months=[];for(let ym=startYm;ym<targetYm;ym=addMonthsYm(ym,1))months.push(ym);
    const bonuses=bonusAllocations(item),bonusByYm={};let bonusTotal=0;
    for(const ym of months){const m=Number(ym.slice(5,7));for(const b of bonuses)if(b.month===m){bonusByYm[ym]=(bonusByYm[ym]||0)+b.amount;bonusTotal+=b.amount}}
    const custom=Number(item.monthlyReserveAmount);const useCustom=String(item.reserveMode||'AUTO').toUpperCase()==='CUSTOM'&&Number.isFinite(custom)&&custom>=0;
    const regular=useCustom?custom:Math.ceil(Math.max(0,shortage-Math.min(shortage,bonusTotal))/Math.max(1,months.length));
    const schedule={};let remaining=shortage;
    for(const ym of months){if(remaining<=0){schedule[ym]=0;continue}const bonus=Math.min(remaining,bonusByYm[ym]||0);remaining-=bonus;const monthly=Math.min(remaining,regular);remaining-=monthly;schedule[ym]=bonus+monthly}
    return{amount,shortage,regular,bonusTotal,schedule,remaining,months};
  }
  function annualReserveSchedule(st,count=7){
    const start=ymNow(),months=Array.from({length:count},(_,i)=>addMonthsYm(start,i)),totals=Object.fromEntries(months.map(m=>[m,0])),items=[];
    for(const item of activeFixed(st).filter(x=>String(x.cadence||'').toUpperCase()==='ANNUAL')){
      const dm=dueMonthOf(item);if(!dm){items.push({item,missing:true,schedule:{}});continue}
      let cycleStart=start,reserved=reservedOf(item),target=annualTarget(item,start),guard=0,combined={};
      while(target&&guard++<3){
        const plan=annualPlanForCycle(item,cycleStart,target.ym,reserved);for(const [ym,a] of Object.entries(plan.schedule)){if(ym in totals){totals[ym]+=a;combined[ym]=(combined[ym]||0)+a}}
        if(target.ym>months.at(-1))break;cycleStart=addMonthsYm(target.ym,1);reserved=0;target={year:target.year+1,month:target.month,ym:`${target.year+1}-${String(target.month).padStart(2,'0')}`};
      }
      items.push({item,missing:false,schedule:combined,target:annualTarget(item,start),currentPlan:annualPlanForCycle(item,start,annualTarget(item,start).ym,reservedOf(item))});
    }
    return{months,totals,items};
  }
  window.householdAnnualReserveScheduleV41=()=>annualReserveSchedule(stateNow(),7);

  function masterGenerated(st,days,base){
    const from=todayIso(),to=iso(new Date(Date.now()+Math.max(0,Number(days)||90)*86400000)),out=[],addedMasterIds=new Set();
    const fromD=new Date(`${from}T12:00:00`),toD=new Date(`${to}T12:00:00`);
    for(const item of activeFixed(st)){
      if(!forecastEnabled(item))continue;const cadence=String(item.cadence||'MONTHLY').toUpperCase(),amount=Math.abs(Number(item.amount)||0);if(!amount)continue;const scope=scopeOf(item),day=dueDayOf(st,item);
      if(cadence==='MONTHLY'||cadence==='SEMI_FIXED'){
        const activeMonths=cadence==='SEMI_FIXED'?semiMonths(item):null;if(cadence==='SEMI_FIXED'&&!activeMonths.length)continue;
        for(let d=new Date(fromD.getFullYear(),fromD.getMonth(),1);d<=toD;d.setMonth(d.getMonth()+1)){
          const y=d.getFullYear(),m=d.getMonth()+1;if(activeMonths&&!activeMonths.includes(m))continue;const date=dateFor(y,m,day||1);if(date<from||date>to)continue;
          out.push({id:`master:${item.id}:${y}-${String(m).padStart(2,'0')}`,date,name:item.name||'固定費',amount:-amount,type:'MASTER_FIXED',expense_scope:scope,ordinary_or_special:scope,generated:true,source:'master_fixed',master_id:item.id,estimated_date:!day});addedMasterIds.add(String(item.id));
        }
      }else if(cadence==='ANNUAL'){
        const target=annualTarget(item,ymNow());if(!target)continue;let date=dateFor(target.year,target.month,day||1);if(date<from&&target.ym===from.slice(0,7))date=from;
        if(date>=from&&date<=to){
          const duplicate=base.some(e=>String(e.date||'').slice(0,7)===target.ym&&Math.abs(Number(e.amount)||0)===amount&&norm(e.name).includes(norm(item.name)));
          if(!duplicate)out.push({id:`master-annual:${item.id}:${target.year}`,date,name:item.name||'年払い',amount:-amount,type:'MASTER_ANNUAL',expense_scope:scope==='NORMAL'?'SPECIAL':scope,ordinary_or_special:scope==='NORMAL'?'SPECIAL':scope,generated:true,source:'master_annual',master_id:item.id,estimated_date:!day});
          addedMasterIds.add(String(item.id));
        }
      }
    }
    return{out,addedMasterIds};
  }
  function salaryEvents(st,days,base){
    const salary=Math.max(0,Number(st.settings?.salary)||0),day=Math.min(31,Math.max(1,Number(st.settings?.salaryDay)||18));if(!salary)return[];
    const from=todayIso(),to=iso(new Date(Date.now()+Math.max(0,Number(days)||90)*86400000)),a=new Date(`${from}T12:00:00`),z=new Date(`${to}T12:00:00`),out=[];
    for(let d=new Date(a.getFullYear(),a.getMonth(),1);d<=z;d.setMonth(d.getMonth()+1)){
      const y=d.getFullYear(),m=d.getMonth()+1,date=dateFor(y,m,day);if(date<from||date>to)continue;const ym=date.slice(0,7);
      const duplicate=base.some(e=>String(e.date||'').slice(0,7)===ym&&Number(e.amount)>0&&(String(e.future_kind||'').toUpperCase()==='INCOME'||/給与|SALARY/i.test(String(e.name||e.type||'')))&&Math.abs(Number(e.amount)-salary)<=1);
      if(!duplicate)out.push({id:`salary:${ym}`,date,name:'給与',amount:salary,type:'SALARY',future_kind:'INCOME',generated:true,source:'settings_salary'});
    }
    return out;
  }

  const previousGenerated=typeof generated==='function'?generated:null;
  if(previousGenerated){
    generated=function generatedV41(days=90){
      const st=stateNow(),base=previousGenerated(days),mg=masterGenerated(st,days,base),schedulableNames=new Map();
      for(const x of activeFixed(st))if(mg.addedMasterIds.has(String(x.id))){const k=norm(x.name);schedulableNames.set(k,(schedulableNames.get(k)||0)+1)}
      const filtered=base.filter(e=>{
        if(e.source!=='rule')return true;const rid=String(e.source_master_id||e.master_id||'');if(rid&&mg.addedMasterIds.has(rid))return false;const k=norm(e.name);return !(schedulableNames.get(k)===1);
      });
      const salaries=salaryEvents(st,days,[...filtered,...mg.out]);return [...filtered,...mg.out,...salaries].sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.name||'').localeCompare(String(b.name||''),'ja'));
    };
  }

  function effectiveFlow(st,count=7){
    const start=ymNow(),reserve=annualReserveSchedule(st,count),months=reserve.months,rows=[];
    let events=[];try{events=generated(Math.max(210,count*31))}catch{}
    for(const ym of months){
      const monthEvents=events.filter(e=>String(e.date||'').startsWith(ym)),income=monthEvents.filter(e=>Number(e.amount)>0).reduce((a,e)=>a+Number(e.amount||0),0),outflow=monthEvents.filter(e=>Number(e.amount)<0).reduce((a,e)=>a+Math.abs(Number(e.amount||0)),0),cashFlow=income-outflow,reserveNeed=Number(reserve.totals[ym]||0),effective=cashFlow-reserveNeed;
      rows.push({ym,income,outflow,cashFlow,reserveNeed,effective,eventCount:monthEvents.length});
    }
    return{rows,reserve};
  }
  window.householdEffectiveFlowV41=()=>effectiveFlow(stateNow(),7);

  function persist(st,reason){window.treasuryRecoverySnapshot?.(reason+'直前');st.cashflowIntegrationVersion=1;if(st.masters)st.masters.updatedAt=new Date().toISOString();window.replaceTreasuryState?.(st);window.repairTreasuryBankBalances?.();window.setTreasurySaveStatus?.('家計CF統合保存済み・同期中');window.cloudSyncOnLocalSave?.();queue()}

  function ensureFixedUi(){
    if($('phase10FixedCardV41'))return;const grid=document.querySelector('#settings .grid');if(!grid)return;
    const card=document.createElement('div');card.id='phase10FixedCardV41';card.className='card full';card.innerHTML=`<div class="title">固定費・準固定 → Cash Flow <span class="tag">Phase 10</span></div><div class="note" style="margin-bottom:10px">家計マスタを正本にします。既存の固定費ルールと名称が一意に一致する場合は引落日を引き継ぎ、予測では旧ルールを二重計上しません。準固定費は適用月を設定してください。</div><div id="phase10FixedSummaryV41" class="tiny" style="margin-bottom:8px"></div><div id="phase10FixedRowsV41"></div>`;
    const master=$('householdMasterCardV1');if(master&&master.parentElement===grid)master.after(card);else grid.appendChild(card);
    card.addEventListener('click',e=>{const save=e.target.closest?.('[data-p10-fixed-save]');if(save)saveFixed(save.dataset.p10FixedSave)});
  }
  function fixedRow(st,item){
    const cadence=String(item.cadence||'MONTHLY').toUpperCase();if(!['MONTHLY','SEMI_FIXED'].includes(cadence))return'';const id=esc(String(item.id)),day=dueDayOf(st,item),legacy=legacyRuleFor(st,item),months=semiMonths(item),scope=scopeOf(item);
    const monthChecks=cadence==='SEMI_FIXED'?`<div style="margin-top:8px"><div class="tiny" style="margin-bottom:5px">適用月</div><div class="controls" style="flex-wrap:wrap">${Array.from({length:12},(_,i)=>i+1).map(m=>`<label class="tag" style="padding:5px 8px"><input type="checkbox" data-p10-month="${id}:${m}" ${months.includes(m)?'checked':''}> ${m}月</label>`).join('')}</div></div>`:'';
    return `<div class="card" style="padding:12px;margin-top:8px"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><div><b>${esc(item.name||'固定費')}</b><div class="tiny">${cadence} · ${yen(item.amount)}${legacy?` · 旧ルール「${esc(legacy.name)}」と連携`:''}</div></div><span class="tag">${forecastEnabled(item)?'CF反映':'CF停止'}</span></div><div class="form" style="grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:8px"><div class="field"><label>引落/支払日</label><input type="number" min="1" max="31" data-p10-day="${id}" value="${day||''}" placeholder="未設定は1日仮置き"></div><div class="field"><label>支出区分</label><select data-p10-scope="${id}">${['NORMAL','SPECIAL','INVESTMENT','DEBT'].map(x=>`<option ${x===scope?'selected':''}>${x}</option>`).join('')}</select></div><div class="field"><label>CF反映</label><select data-p10-enabled="${id}"><option value="1" ${forecastEnabled(item)?'selected':''}>する</option><option value="0" ${!forecastEnabled(item)?'selected':''}>しない</option></select></div></div>${monthChecks}<div class="controls" style="margin-top:8px"><button class="btn" data-p10-fixed-save="${id}">保存</button></div></div>`;
  }
  function saveFixed(id){const st=stateNow(),item=(st.masters?.fixedExpenses||[]).find(x=>String(x.id)===String(id));if(!item)return;const q=s=>document.querySelector(s),key=CSS.escape(String(id)),raw=q(`[data-p10-day="${key}"]`)?.value,day=raw===''?null:Number(raw);if(day!==null&&(!Number.isInteger(day)||day<1||day>31))return alert('日付は1〜31で入力してください。');item.dueDay=day;item.expense_scope=q(`[data-p10-scope="${key}"]`)?.value||'NORMAL';item.forecastEnabled=q(`[data-p10-enabled="${key}"]`)?.value!=='0';if(String(item.cadence||'').toUpperCase()==='SEMI_FIXED'){item.activeMonths=Array.from({length:12},(_,i)=>i+1).filter(m=>q(`[data-p10-month="${key}:${m}"]`)?.checked)}persist(st,`固定費「${item.name||''}」CF設定変更`)}
  function renderFixed(){ensureFixedUi();const st=stateNow(),items=activeFixed(st).filter(x=>['MONTHLY','SEMI_FIXED'].includes(String(x.cadence||'').toUpperCase())),semiMissing=items.filter(x=>String(x.cadence).toUpperCase()==='SEMI_FIXED'&&!semiMonths(x).length).length,dayMissing=items.filter(x=>!dueDayOf(st,x)).length;$('phase10FixedSummaryV41').innerHTML=`対象 ${items.length}件 · 日未設定 ${dayMissing}件（予測では月初に仮置き）${semiMissing?` · <span class="warn">適用月未設定の準固定 ${semiMissing}件は予測未反映</span>`:''}`;$('phase10FixedRowsV41').innerHTML=items.map(x=>fixedRow(st,x)).join('')||'<div class="muted">MONTHLY / SEMI_FIXED のマスタはありません。</div>'}

  function ensureAnnualUi(){
    if($('phase10AnnualCardV41'))return;const grid=document.querySelector('#settings .grid');if(!grid)return;const old=$('annualReserveCardV36');if(old)old.style.display='none';
    const card=document.createElement('div');card.id='phase10AnnualCardV41';card.className='card full';card.innerHTML=`<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><div><div class="title">年払い・積立プラン <span class="tag">Phase 10</span></div><div class="tiny">毎月均等だけでなく、ボーナス月の追加積立を組み合わせます。積立は口座残高を減らさず、「実質余裕フロー」から差し引きます。</div></div><button class="btn" id="p10AddAnnualV41">＋年払い</button></div><div id="p10AnnualSummaryV41" class="form" style="margin-top:10px"></div><div id="p10AnnualRowsV41" style="margin-top:10px"></div>`;grid.appendChild(card);$('p10AddAnnualV41').onclick=addAnnual;card.addEventListener('click',e=>{const save=e.target.closest?.('[data-p10-annual-save]'),paid=e.target.closest?.('[data-p10-annual-paid]');if(save)saveAnnual(save.dataset.p10AnnualSave);if(paid)markAnnualPaid(paid.dataset.p10AnnualPaid)})
  }
  function annualRow(st,entry){const item=entry.item,id=esc(String(item.id)),t=entry.target,p=entry.currentPlan,mode=String(item.reserveMode||'AUTO').toUpperCase(),b=bonusAllocations(item),b1=b[0]||{},b2=b[1]||{},day=dueDayOf(st,item);return `<div class="card" style="padding:12px;margin-top:8px"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><div><b>${esc(item.name||'年払い')}</b><div class="tiny">年額 ${yen(item.amount)} · 積立済 ${yen(reservedOf(item))}${t?` · 次回 ${t.year}年${t.month}月`:''}</div></div><span class="tag">今月予定 ${yen(entry.schedule?.[ymNow()]||0)}</span></div><div class="form" style="grid-template-columns:repeat(4,1fr);gap:8px;margin-top:8px"><div class="field"><label>支払月</label><input type="number" min="1" max="12" data-p10-adue="${id}" value="${dueMonthOf(item)||''}"></div><div class="field"><label>支払日</label><input type="number" min="1" max="31" data-p10-aday="${id}" value="${day||''}" placeholder="未設定は1日仮置き"></div><div class="field"><label>積立済額</label><input type="number" min="0" data-p10-areserved="${id}" value="${Math.round(reservedOf(item))}"></div><div class="field"><label>積立方式</label><select data-p10-amode="${id}"><option value="AUTO" ${mode!=='CUSTOM'?'selected':''}>自動</option><option value="CUSTOM" ${mode==='CUSTOM'?'selected':''}>毎月額を指定</option></select></div><div class="field"><label>指定毎月額</label><input type="number" min="0" data-p10-amonthly="${id}" value="${Number(item.monthlyReserveAmount)||0}"></div><div class="field"><label>ボーナス1 月 / 額</label><div class="controls"><input type="number" min="1" max="12" data-p10-bm1="${id}" value="${b1.month||''}" placeholder="月"><input type="number" min="0" data-p10-ba1="${id}" value="${b1.amount||''}" placeholder="額"></div></div><div class="field"><label>ボーナス2 月 / 額</label><div class="controls"><input type="number" min="1" max="12" data-p10-bm2="${id}" value="${b2.month||''}" placeholder="月"><input type="number" min="0" data-p10-ba2="${id}" value="${b2.amount||''}" placeholder="額"></div></div></div>${p?`<div class="tiny" style="margin-top:8px">現在サイクル: 不足 ${yen(p.shortage)} · 通常月 ${yen(p.regular)} · 支払前ボーナス計画 ${yen(p.bonusTotal)}${p.remaining>0?` · <span class="warn">計画後も不足 ${yen(p.remaining)}</span>`:''}</div>`:'<div class="tiny warn" style="margin-top:8px">支払月未設定</div>'}<div class="controls" style="margin-top:8px;flex-wrap:wrap"><button class="btn" data-p10-annual-save="${id}">保存</button><button class="btn secondary" data-p10-annual-paid="${id}">今年分支払済み</button></div></div>`}
  function addAnnual(){const name=prompt('年払い名','');if(!name)return;const amount=Number(prompt('年額',''));if(!Number.isFinite(amount)||amount<=0)return alert('年額を確認してください。');const month=Number(prompt('支払月（1〜12）',''));if(!Number.isInteger(month)||month<1||month>12)return alert('支払月を確認してください。');const st=stateNow();st.masters=st.masters||{};st.masters.fixedExpenses=Array.isArray(st.masters.fixedExpenses)?st.masters.fixedExpenses:[];st.masters.fixedExpenses.push({id:crypto.randomUUID(),name,amount:Math.abs(amount),cadence:'ANNUAL',dueMonth:month,reservedAmount:0,reserveMode:'AUTO',active:true,expense_scope:'SPECIAL'});persist(st,`年払い「${name}」追加`)}
  function saveAnnual(id){const st=stateNow(),item=(st.masters?.fixedExpenses||[]).find(x=>String(x.id)===String(id));if(!item)return;const q=s=>document.querySelector(s),key=CSS.escape(String(id)),num=(attr,allowBlank=false)=>{const v=q(`[${attr}="${key}"]`)?.value??'';return allowBlank&&v===''?null:Number(v)},dm=num('data-p10-adue'),day=num('data-p10-aday',true),res=num('data-p10-areserved'),monthly=num('data-p10-amonthly'),mode=q(`[data-p10-amode="${key}"]`)?.value||'AUTO';if(!Number.isInteger(dm)||dm<1||dm>12)return alert('支払月を確認してください。');if(day!==null&&(!Number.isInteger(day)||day<1||day>31))return alert('支払日を確認してください。');if(!Number.isFinite(res)||res<0||!Number.isFinite(monthly)||monthly<0)return alert('積立額を確認してください。');const bonuses=[];for(const i of [1,2]){const m=num(`data-p10-bm${i}`,true),a=num(`data-p10-ba${i}`,true);if(m===null&&a===null)continue;if(!Number.isInteger(m)||m<1||m>12||!Number.isFinite(a)||a<0)return alert(`ボーナス${i}の月・額を確認してください。`);if(a>0)bonuses.push({month:m,amount:a})}item.dueMonth=dm;item.dueDay=day;item.reservedAmount=Math.round(res);item.reserveMode=mode;item.monthlyReserveAmount=Math.round(monthly);item.bonusAllocations=bonuses;item.expense_scope=item.expense_scope||'SPECIAL';persist(st,`年払い「${item.name||''}」積立設定変更`)}
  function markAnnualPaid(id){const st=stateNow(),item=(st.masters?.fixedExpenses||[]).find(x=>String(x.id)===String(id));if(!item)return;const year=new Date().getFullYear();if(!confirm(`${item.name||'年払い'}を${year}年分支払済みにしますか？\n積立済額を0円に戻します。`))return;item.lastPaidYear=year;item.reservedAmount=0;item.lastPaidAt=new Date().toISOString();persist(st,`年払い「${item.name||''}」支払済み`)}
  function renderAnnual(){ensureAnnualUi();const st=stateNow(),plan=annualReserveSchedule(st,7),annuals=plan.items,annualTotal=annuals.reduce((a,x)=>a+Math.max(0,Number(x.item.amount)||0),0),reserved=annuals.reduce((a,x)=>a+reservedOf(x.item),0),thisMonth=plan.totals[ymNow()]||0,bonus=annuals.reduce((a,x)=>a+bonusAllocations(x.item).reduce((s,b)=>s+b.amount,0),0);$('p10AnnualSummaryV41').innerHTML=[['年払い合計',annualTotal],['積立済み',reserved],['今月積立予定',thisMonth],['年間ボーナス配分',bonus]].map(([k,v])=>`<div><span class="muted">${k}</span><b style="display:block;font-size:19px;margin-top:5px">${yen(v)}</b></div>`).join('');$('p10AnnualRowsV41').innerHTML=annuals.length?annuals.map(x=>annualRow(st,x)).join(''):'<div class="muted">年払いはまだありません。</div>'}

  function ensureFlowUi(){if($('phase10FlowCardV41'))return;const grid=document.querySelector('#dashboard .grid');if(!grid)return;const card=document.createElement('div');card.id='phase10FlowCardV41';card.className='card full';card.innerHTML=`<div class="title">実質余裕フロー <span class="tag">Phase 10</span></div><div class="tiny" style="margin-bottom:10px">表面キャッシュフローから、年払いのために今月確保すべき積立を差し引きます。積立そのものは銀行残高からは減らしません。</div><div id="p10FlowNowV41" class="form"></div><div id="p10FlowRowsV41" style="margin-top:10px"></div>`;const p8=$('dashboardPhase8V39');if(p8&&p8.parentElement===grid)p8.after(card);else grid.prepend(card)}
  function renderFlow(){ensureFlowUi();const st=stateNow(),f=effectiveFlow(st,7),now=f.rows[0]||{income:0,outflow:0,cashFlow:0,reserveNeed:0,effective:0};$('p10FlowNowV41').innerHTML=[['今月これからの収入',now.income],['今月これからの支出',now.outflow],['表面余剰',now.cashFlow],['年払い積立',now.reserveNeed],['実質余剰',now.effective]].map(([k,v],i)=>`<div><span class="muted">${k}</span><b class="${i===4?(v>=0?'good':'bad'):''}" style="display:block;font-size:${i===4?'23':'19'}px;margin-top:5px">${yen(v)}</b></div>`).join('');$('p10FlowRowsV41').innerHTML=`<div class="table"><table style="min-width:560px"><thead><tr><th>月</th><th>収入</th><th>支出</th><th>表面CF</th><th>年払い積立</th><th>実質余剰</th></tr></thead><tbody>${f.rows.map((r,i)=>`<tr><td>${i===0?'今月残り':esc(r.ym)}</td><td class="good">${yen(r.income)}</td><td class="bad">${yen(r.outflow)}</td><td class="${r.cashFlow>=0?'good':'bad'}">${yen(r.cashFlow)}</td><td>${yen(r.reserveNeed)}</td><td class="${r.effective>=0?'good':'bad'}"><b>${yen(r.effective)}</b></td></tr>`).join('')}</tbody></table></div>`}

  function relabelLegacy(){const rules=$('rules')?.closest('.card');if(rules){const t=rules.querySelector('.title');if(t)t.textContent='固定費ルール（互換用）';if(!rules.querySelector('[data-p10-legacy-note]')){const n=document.createElement('div');n.dataset.p10LegacyNote='1';n.className='tiny';n.style.marginBottom='8px';n.textContent='Phase 10では家計マスタが正本です。一致するルールは予測で二重計上しません。未移行・特殊ルールだけここに残します。';t?.after(n)}}}
  function queue(){clearTimeout(timer);timer=setTimeout(renderAll,80)}
  function renderAll(){try{renderFixed();renderAnnual();renderFlow();relabelLegacy()}catch(e){console.error('Phase10 render',e)}}
  function boot(){renderAll();document.addEventListener('click',e=>{if(e.target.closest?.('[data-page="dashboard"],[data-page="settings"]'))setTimeout(renderAll,0)});window.addEventListener('focus',queue);const root=document.querySelector('main.app');if(root){observer=new MutationObserver(()=>{if(!$('phase10FlowCardV41')||!$('phase10AnnualCardV41'))queue()});observer.observe(root,{childList:true,subtree:true})}window.renderCashflowIntegrationV41=renderAll}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
})();