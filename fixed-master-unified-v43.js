(() => {
  const CARD_ID='unifiedFixedMasterV43';
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const yen=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
  const norm=s=>String(s??'').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/]/g,'').toUpperCase();
  const stateNow=()=> (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{};
  const SCOPES=['NORMAL','SPECIAL','INVESTMENT','DEBT','TRANSFER'];
  const ROUTES=['DIRECT','CARD','TRACK_ONLY'];
  let timer=null,intercepting=false;

  function ensureShape(st){
    st.masters=st.masters||{};
    st.masters.fixedExpenses=Array.isArray(st.masters.fixedExpenses)?st.masters.fixedExpenses:[];
    st.rules=Array.isArray(st.rules)?st.rules:[];
    st.legacyFixedRulesArchive=Array.isArray(st.legacyFixedRulesArchive)?st.legacyFixedRulesArchive:[];
    return st;
  }
  function scopeOf(x){const s=String(x?.expense_scope||x?.ordinary_or_special||'NORMAL').toUpperCase();return s==='ORDINARY'?'NORMAL':SCOPES.includes(s)?s:'NORMAL'}
  function routeOf(x){const r=String(x?.paymentRoute||x?.payment_route||'DIRECT').toUpperCase();return ROUTES.includes(r)?r:'DIRECT'}
  function migrateRules(st){
    ensureShape(st);if(!st.rules.length)return false;let changed=false;
    const now=new Date().toISOString();
    for(const r of st.rules){
      if(!st.legacyFixedRulesArchive.some(x=>String(x.id||'')===String(r.id||'')))st.legacyFixedRulesArchive.push({...structuredClone(r),archivedAt:now,archiveReason:'merged_into_fixed_master_v43'});
      const rid=String(r.source_master_id||r.master_id||''),rn=norm(r.name);
      let item=rid?st.masters.fixedExpenses.find(x=>String(x.id)===rid):null;
      if(!item&&rn){const hits=st.masters.fixedExpenses.filter(x=>norm(x.name)===rn);if(hits.length===1)item=hits[0]}
      if(!item){
        item={id:`fixed:${crypto.randomUUID()}`,name:r.name||'固定費',amount:Math.abs(Number(r.amount)||0),cadence:'MONTHLY',active:r.enabled!==false,dueDay:Number(r.day)||1,expense_scope:scopeOf(r),paymentRoute:'DIRECT',payment_route:'DIRECT',forecastEnabled:r.enabled!==false,source:'legacy-rule-migration-v43',createdAt:now};
        st.masters.fixedExpenses.push(item);
      }else{
        if(item.dueDay==null&&Number(r.day)>=1&&Number(r.day)<=31)item.dueDay=Number(r.day);
        if(!item.expense_scope)item.expense_scope=scopeOf(r);
        if(!item.paymentRoute)item.paymentRoute='DIRECT';
        if(!item.payment_route)item.payment_route=item.paymentRoute;
        if(item.forecastEnabled==null)item.forecastEnabled=r.enabled!==false;
      }
      changed=true;
    }
    st.rules=[];st.fixedMasterUnifiedVersion=1;st.masters.updatedAt=now;return changed;
  }

  const originalReplace=window.replaceTreasuryState;
  if(typeof originalReplace==='function'){
    window.replaceTreasuryState=function replaceTreasuryStateV43(next){
      if(!intercepting){intercepting=true;try{migrateRules(next)}finally{intercepting=false}}
      return originalReplace(next);
    };
  }
  function persist(st,reason){
    ensureShape(st);migrateRules(st);window.treasuryRecoverySnapshot?.(`${reason}直前`);st.fixedMasterUnifiedVersion=1;st.masters.updatedAt=new Date().toISOString();
    window.replaceTreasuryState?.(st);window.repairTreasuryBankBalances?.();window.setTreasurySaveStatus?.('固定費マスタ保存済み・同期中');window.cloudSyncOnLocalSave?.();queue();
  }
  function migrateExisting(){const st=stateNow();if(migrateRules(st)){persist(st,'旧固定費ルール統合')}}

  function hideLegacy(){
    const rules=$('rules')?.closest('.card');if(rules)rules.style.display='none';
    const p10f=$('phase10FixedCardV41');if(p10f)p10f.style.display='none';
    const p10a=$('phase10AnnualCardV41');if(p10a)p10a.style.display='none';
    const oldFixed=$('masterFixedV1')?.closest('.card');if(oldFixed)oldFixed.style.display='none';
    const add=$('masterAddFixedV1');if(add)add.style.display='none';
    const addRule=$('addRule');if(addRule)addRule.style.display='none';
  }
  function ensureUi(){
    hideLegacy();if($(CARD_ID))return true;const grid=document.querySelector('#settings .grid');if(!grid)return false;
    const card=document.createElement('div');card.id=CARD_ID;card.className='card full';
    card.innerHTML=`<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap"><div><div class="title" style="margin-bottom:3px">固定費・準固定・年払いマスタ <span class="tag">統合 v43</span></div><div class="tiny">このマスタだけが正本です。旧「固定費ルール」は自動移行済みで、今後は使用しません。</div></div><div class="controls" style="flex-wrap:wrap"><button class="btn" data-v43-add="MONTHLY">＋固定費</button><button class="btn secondary" data-v43-add="SEMI_FIXED">＋準固定</button><button class="btn secondary" data-v43-add="ANNUAL">＋年払い</button></div></div><div id="v43FixedSummary" class="form" style="margin-top:12px"></div><div id="v43FixedRows" style="margin-top:12px"></div>`;
    const master=$('householdMasterCardV1');if(master&&master.parentElement===grid)master.after(card);else grid.prepend(card);
    card.addEventListener('click',e=>{const a=e.target.closest?.('[data-v43-add]');if(a)return addItem(a.dataset.v43Add);const s=e.target.closest?.('[data-v43-save]');if(s)return saveItem(s.dataset.v43Save);const d=e.target.closest?.('[data-v43-del]');if(d)return delItem(d.dataset.v43Del)});
    return true;
  }
  function monthsOf(x){const raw=Array.isArray(x.activeMonths)?x.activeMonths:[];return [...new Set(raw.map(Number).filter(n=>n>=1&&n<=12))].sort((a,b)=>a-b)}
  function commonFields(x){const id=esc(String(x.id)),cad=String(x.cadence||'MONTHLY').toUpperCase(),scope=scopeOf(x),route=routeOf(x);return `<div class="form" style="grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px"><div class="field"><label>名称</label><input data-v43-name="${id}" value="${esc(x.name||'')}"></div><div class="field"><label>金額</label><input type="number" min="0" data-v43-amount="${id}" value="${Math.abs(Number(x.amount)||0)}"></div><div class="field"><label>種類</label><select data-v43-cadence="${id}"><option value="MONTHLY" ${cad==='MONTHLY'?'selected':''}>固定費（毎月）</option><option value="SEMI_FIXED" ${cad==='SEMI_FIXED'?'selected':''}>準固定</option><option value="ANNUAL" ${cad==='ANNUAL'?'selected':''}>年払い</option></select></div><div class="field"><label>支払日</label><input type="number" min="1" max="31" data-v43-day="${id}" value="${Number(x.dueDay||x.paymentDay||x.day)||''}" placeholder="1〜31"></div><div class="field"><label>支出区分</label><select data-v43-scope="${id}">${SCOPES.map(v=>`<option value="${v}" ${v===scope?'selected':''}>${v}</option>`).join('')}</select></div><div class="field"><label>支払経路</label><select data-v43-route="${id}"><option value="DIRECT" ${route==='DIRECT'?'selected':''}>口座・現金から直接</option><option value="CARD" ${route==='CARD'?'selected':''}>カード請求に含む</option><option value="TRACK_ONLY" ${route==='TRACK_ONLY'?'selected':''}>管理のみ</option></select></div></div>`}
  function extraFields(x){const id=esc(String(x.id)),cad=String(x.cadence||'MONTHLY').toUpperCase();if(cad==='SEMI_FIXED'){const ms=monthsOf(x);return `<div style="margin-top:8px"><div class="tiny">適用月</div><div class="controls" style="flex-wrap:wrap;margin-top:5px">${Array.from({length:12},(_,i)=>i+1).map(m=>`<label class="tag" style="padding:5px 8px"><input type="checkbox" data-v43-month="${id}:${m}" ${ms.includes(m)?'checked':''}> ${m}月</label>`).join('')}</div></div>`}if(cad==='ANNUAL'){const bonus=Array.isArray(x.bonusAllocations)?x.bonusAllocations:[],b1=bonus[0]||{},b2=bonus[1]||{},mode=String(x.reserveMode||'AUTO').toUpperCase();return `<div class="form" style="grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px"><div class="field"><label>支払月</label><input type="number" min="1" max="12" data-v43-due-month="${id}" value="${Number(x.dueMonth)||''}"></div><div class="field"><label>積立済額</label><input type="number" min="0" data-v43-reserved="${id}" value="${Math.max(0,Number(x.reservedAmount)||0)}"></div><div class="field"><label>積立方式</label><select data-v43-mode="${id}"><option value="AUTO" ${mode!=='CUSTOM'?'selected':''}>自動</option><option value="CUSTOM" ${mode==='CUSTOM'?'selected':''}>毎月額指定</option></select></div><div class="field"><label>指定毎月額</label><input type="number" min="0" data-v43-monthly="${id}" value="${Math.max(0,Number(x.monthlyReserveAmount)||0)}"></div><div class="field"><label>ボーナス1 月 / 額</label><div class="controls"><input type="number" min="1" max="12" data-v43-bm1="${id}" value="${b1.month||''}" placeholder="月"><input type="number" min="0" data-v43-ba1="${id}" value="${b1.amount||''}" placeholder="額"></div></div><div class="field"><label>ボーナス2 月 / 額</label><div class="controls"><input type="number" min="1" max="12" data-v43-bm2="${id}" value="${b2.month||''}" placeholder="月"><input type="number" min="0" data-v43-ba2="${id}" value="${b2.amount||''}" placeholder="額"></div></div></div>`}return''}
  function row(x){const id=esc(String(x.id)),route=routeOf(x),routeText=route==='CARD'?'カード引落でCF計上':route==='TRACK_ONLY'?'CF計上なし':'マスタからCF計上';return `<div class="card" style="padding:12px;margin-top:8px"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><div><b>${esc(x.name||'未設定')}</b><div class="tiny">${esc(String(x.cadence||'MONTHLY'))} · ${yen(x.amount)} · ${routeText}</div></div><span class="tag">${x.active===false?'停止':'有効'}</span></div>${commonFields(x)}${extraFields(x)}<div class="controls" style="margin-top:10px;flex-wrap:wrap"><button class="btn" data-v43-save="${id}">保存</button><button class="btn secondary" data-v43-del="${id}">削除</button></div></div>`}
  function render(){if(!ensureUi())return;hideLegacy();const st=stateNow();ensureShape(st);const items=[...st.masters.fixedExpenses].filter(x=>x.active!==false).sort((a,b)=>({MONTHLY:1,SEMI_FIXED:2,ANNUAL:3}[String(a.cadence).toUpperCase()]||9)-({MONTHLY:1,SEMI_FIXED:2,ANNUAL:3}[String(b.cadence).toUpperCase()]||9)||String(a.name||'').localeCompare(String(b.name||''),'ja'));const c={MONTHLY:0,SEMI_FIXED:0,ANNUAL:0};items.forEach(x=>{const k=String(x.cadence||'MONTHLY').toUpperCase();if(k in c)c[k]++});$('v43FixedSummary').innerHTML=[['固定費',c.MONTHLY],['準固定',c.SEMI_FIXED],['年払い',c.ANNUAL],['合計',items.length]].map(([k,v])=>`<div><span class="muted">${k}</span><b style="display:block;font-size:19px;margin-top:5px">${v}件</b></div>`).join('');$('v43FixedRows').innerHTML=items.length?items.map(row).join(''):'<div class="muted">まだ項目がありません。上のボタンから追加できます。</div>'}
  function addItem(cadence){if(!['MONTHLY','SEMI_FIXED','ANNUAL'].includes(cadence))return;const name=prompt(cadence==='ANNUAL'?'年払い名':cadence==='SEMI_FIXED'?'準固定費名':'固定費名','');if(!name)return;const amount=Number(prompt('金額',''));if(!Number.isFinite(amount)||amount<0)return alert('金額を確認してください。');const st=stateNow();ensureShape(st);const x={id:`fixed:${crypto.randomUUID()}`,name:name.trim(),amount:Math.abs(amount),cadence,active:true,expense_scope:cadence==='ANNUAL'?'SPECIAL':'NORMAL',paymentRoute:'DIRECT',payment_route:'DIRECT',forecastEnabled:true,createdAt:new Date().toISOString(),source:'unified-master-v43'};if(cadence==='SEMI_FIXED')x.activeMonths=[];if(cadence==='ANNUAL'){x.reservedAmount=0;x.reserveMode='AUTO';x.monthlyReserveAmount=0;x.bonusAllocations=[]}st.masters.fixedExpenses.push(x);persist(st,`${name}追加`)}
  function q(id,attr){return document.querySelector(`[${attr}="${CSS.escape(String(id))}"]`)}
  function saveItem(id){const st=stateNow();ensureShape(st);const x=st.masters.fixedExpenses.find(v=>String(v.id)===String(id));if(!x)return;const name=q(id,'data-v43-name')?.value.trim(),amount=Number(q(id,'data-v43-amount')?.value),cad=q(id,'data-v43-cadence')?.value,dayRaw=q(id,'data-v43-day')?.value,day=dayRaw===''?null:Number(dayRaw),scope=q(id,'data-v43-scope')?.value,route=q(id,'data-v43-route')?.value;if(!name)return alert('名称を入力してください。');if(!Number.isFinite(amount)||amount<0)return alert('金額を確認してください。');if(!['MONTHLY','SEMI_FIXED','ANNUAL'].includes(cad))return;if(day!==null&&(!Number.isInteger(day)||day<1||day>31))return alert('支払日は1〜31で入力してください。');Object.assign(x,{name,amount:Math.abs(amount),cadence:cad,dueDay:day,expense_scope:SCOPES.includes(scope)?scope:'NORMAL',paymentRoute:ROUTES.includes(route)?route:'DIRECT',payment_route:ROUTES.includes(route)?route:'DIRECT',forecastEnabled:route!=='TRACK_ONLY'});if(cad==='SEMI_FIXED'){x.activeMonths=Array.from({length:12},(_,i)=>i+1).filter(m=>document.querySelector(`[data-v43-month="${CSS.escape(String(id))}:${m}"]`)?.checked)}else delete x.activeMonths;if(cad==='ANNUAL'){const dm=Number(q(id,'data-v43-due-month')?.value),res=Number(q(id,'data-v43-reserved')?.value||0),monthly=Number(q(id,'data-v43-monthly')?.value||0),mode=q(id,'data-v43-mode')?.value||'AUTO';if(!Number.isInteger(dm)||dm<1||dm>12)return alert('年払いの支払月を1〜12で入力してください。');if(!Number.isFinite(res)||res<0||!Number.isFinite(monthly)||monthly<0)return alert('積立額を確認してください。');x.dueMonth=dm;x.reservedAmount=res;x.reserveMode=mode;x.monthlyReserveAmount=monthly;const bs=[];for(const i of [1,2]){const mv=q(id,`data-v43-bm${i}`)?.value??'',av=q(id,`data-v43-ba${i}`)?.value??'';if(mv===''&&av==='')continue;const m=Number(mv),a=Number(av);if(!Number.isInteger(m)||m<1||m>12||!Number.isFinite(a)||a<0)return alert(`ボーナス${i}を確認してください。`);if(a>0)bs.push({month:m,amount:a})}x.bonusAllocations=bs}else{delete x.dueMonth;delete x.reservedAmount;delete x.reserveMode;delete x.monthlyReserveAmount;delete x.bonusAllocations}persist(st,`${name}編集`)}
  function delItem(id){const st=stateNow();ensureShape(st);const x=st.masters.fixedExpenses.find(v=>String(v.id)===String(id));if(!x)return;if(!confirm(`「${x.name||'この項目'}」を削除しますか？`))return;st.masters.fixedExpenses=st.masters.fixedExpenses.filter(v=>String(v.id)!==String(id));persist(st,`${x.name||'固定費'}削除`)}
  function queue(){clearTimeout(timer);timer=setTimeout(render,70)}
  function boot(){migrateExisting();render();document.addEventListener('click',e=>{if(e.target.closest?.('[data-page="settings"]'))setTimeout(render,0)});window.addEventListener('focus',queue);window.renderUnifiedFixedMasterV43=render}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
})();