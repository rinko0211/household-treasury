(() => {
  const KEY='householdTreasuryMVP';
  const MASTER_GUARD_KEY='householdTreasuryMasterGuardV57';
  const $=id=>document.getElementById(id);
  const norm=s=>String(s??'').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/\.]/g,'').toUpperCase();
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const stateNow=()=> (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{};
  const clone=o=>structuredClone(o||{});
  const hash32=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return(h>>>0).toString(16)};
  const isRakuten=s=>{const n=norm(s);return n.includes('RAKUTEN')||n.includes('楽天')};
  let guarding=false,masterPreserved=false,patchTimer=null;

  function mastersComparable(m){const x=clone(m||{});delete x.updatedAt;return JSON.stringify(x)}
  function masterHasData(m){return !!((m?.cards?.length||0)+(m?.fixedExpenses?.length||0)+(m?.accounts?.length||0)+(m?.liabilities?.length||0))}
  function readGuard(){try{return JSON.parse(localStorage.getItem(MASTER_GUARD_KEY)||'null')}catch{return null}}
  function writeGuard(m,reason='local'){if(!masterHasData(m))return;const savedAt=m.updatedAt||new Date().toISOString();try{localStorage.setItem(MASTER_GUARD_KEY,JSON.stringify({version:1,savedAt,reason,masters:clone(m)}))}catch{}}
  function time(v){const n=Date.parse(v||'');return Number.isFinite(n)?n:0}

  const previousReplace=window.replaceTreasuryState;
  if(typeof previousReplace==='function'&&!window.__masterIntegrityV57Wrapped){
    window.__masterIntegrityV57Wrapped=true;
    window.replaceTreasuryState=function replaceTreasuryStateV57(next){
      if(guarding)return previousReplace(next);
      guarding=true;
      try{
        next=clone(next||{});
        const current=stateNow(),curM=current.masters||{},nextM=next.masters||{};
        const different=mastersComparable(curM)!==mastersComparable(nextM);
        const remote=!!window.__treasuryApplyingRemote;
        const explicitRestore=!!window.__treasuryRecoveryRestoring;
        if(remote&&!explicitRestore&&different&&masterHasData(curM)){
          const guard=readGuard(),curTs=Math.max(time(curM.updatedAt),time(guard?.savedAt)),nextTs=time(nextM.updatedAt);
          if(curTs>nextTs){next.masters=clone(curM);masterPreserved=true;writeGuard(next.masters,'remote-rollback-blocked')}
        }else if(!remote&&!explicitRestore&&different){
          next.masters=next.masters||{};next.masters.updatedAt=new Date().toISOString();writeGuard(next.masters,'local-change');
        }
        const result=previousReplace(next);
        const after=stateNow();if(masterHasData(after.masters))writeGuard(after.masters,'after-replace');
        if(masterPreserved){masterPreserved=false;setTimeout(()=>{window.setTreasurySaveStatus?.('新しい端末マスタを保持・再同期中');window.cloudSyncOnLocalSave?.()},900)}
        return result;
      }finally{guarding=false}
    };
  }
  const bootState=stateNow();if(masterHasData(bootState.masters))writeGuard(bootState.masters,'v57-boot');

  function valNumber(v){const s=String(v??'').replace(/[,￥¥\s]/g,'').trim();if(!s||s==='-'||s==='—')return null;const n=Number(s);return Number.isFinite(n)?n:null}
  function parseDateLoose(v){const s=String(v||'').trim().replace(/[.]/g,'/');const m=s.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);return m?`${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`:s}
  function exactRakutenScan(src,file){
    if(typeof parseCsv!=='function'||typeof findHeader!=='function'||typeof rowObj!=='function')return null;
    const rows=parseCsv(src.text),hi=findHeader(rows,['利用日','利用店名・商品名']);if(hi<0)return null;
    const h=rows[hi].map(x=>String(x).replace(/^\uFEFF/,'')),fm=String(file?.name||'').match(/enavi(\d{4})(\d{2})/i),billingMonth=fm?`${fm[1]}-${fm[2]}`:'';
    const payHeader=h.find(x=>/^\d{1,2}月支払金額$/.test(String(x).trim()));if(!billingMonth||!payHeader)return null;
    const counts=new Map(),lines=[];let total=0,adjustmentTotal=0,adjustmentCount=0;
    for(const r of rows.slice(hi+1)){
      const o=rowObj(h,r);if(!o['利用日'])continue;
      const billed=valNumber(o[payHeader]);if(billed===null)continue;
      const merchant=String(o['利用店名・商品名']||''),payment=String(o['支払方法']||''),amount=valNumber(o['利用金額']);
      const refi=/ﾍﾝｻｲﾍﾝｺｳ|返済方法変更ＷＥＢ|分割変更/i.test(`${merchant} ${payment}`)||amount===null;
      const date=parseDateLoose(o['利用日']),base=[billingMonth,date,norm(merchant),norm(payment),String(billed),refi?'A':'P'].join('|'),occ=(counts.get(base)||0)+1;counts.set(base,occ);
      const id=`rakuten-bill57:${billingMonth}:${hash32(`${base}|${occ}`)}`;
      const line={billing_line_id:id,card:'Rakuten',billing_month:billingMonth,purchase_date:date,merchant_raw:merchant,merchant_normalized:norm(merchant),original_amount:amount===null?null:Math.abs(amount),billed_amount:billed,payment_method:payment,occurrence_index:occ,line_kind:refi?'ADJUSTMENT':'PURCHASE',source_files:[file.name],source_file:file.name,confidence:1,billing_model:'RAKUTEN_EXACT_V57'};
      lines.push(line);total+=billed;if(refi){adjustmentCount++;adjustmentTotal+=billed}
    }
    return{billingMonth,payHeader,lines,total,adjustmentCount,adjustmentTotal};
  }
  function linkBillingPurchases(st,scan){
    for(const line of scan.lines){if(line.line_kind!=='PURCHASE'||line.original_amount===null)continue;const c=(st.purchaseEvents||[]).filter(p=>isRakuten(p.card)&&String(p.billing_month||'')===scan.billingMonth&&String(p.purchase_date||'')===line.purchase_date&&norm(p.merchant_raw||p.merchant_normalized||'')===norm(line.merchant_raw)&&Math.abs(Number(p.original_amount)||0)===Math.abs(Number(line.original_amount)||0));if(c.length===1){line.purchase_id=c[0].purchase_id||null;line.fixed_expense_master_id=c[0].fixed_expense_master_id||null;line.category=c[0].category||null;line.subcategory=c[0].subcategory||null}}
  }
  function applyExactRakuten(st,scan,file){
    if(!scan)return false;st.cardBillingLines=Array.isArray(st.cardBillingLines)?st.cardBillingLines:[];st.cardSettlements=Array.isArray(st.cardSettlements)?st.cardSettlements:[];
    linkBillingPurchases(st,scan);st.cardBillingLines=st.cardBillingLines.filter(x=>!(isRakuten(x.card)&&String(x.billing_month||'')===scan.billingMonth));st.cardBillingLines.push(...scan.lines);
    const [y,m]=scan.billingMonth.split('-').map(Number),due=(typeof ruleDate==='function'?ruleDate(y,m,27):`${scan.billingMonth}-27`),sid=`rakuten:${scan.billingMonth}`;
    let s=st.cardSettlements.find(x=>String(x.settlement_id||'')===sid);if(!s){s={settlement_id:sid,card:'Rakuten'};st.cardSettlements.push(s)}
    Object.assign(s,{card:'Rakuten',due_date:due,amount:Math.abs(scan.total),source_file:file?.name||s.source_file,confidence:1,billing_line_ids:scan.lines.map(x=>x.billing_line_id),detail_count:scan.lines.length,detail_payment_total:scan.total,detail_difference:0,detail_reconciled:true,billing_model:'RAKUTEN_EXACT_V57',billing_audit:{source_column:scan.payHeader,line_count:scan.lines.length,adjustment_count:scan.adjustmentCount,adjustment_total:scan.adjustmentTotal,source_total:scan.total,audited_at:new Date().toISOString()}});
    return true;
  }

  const prevRakuten=typeof parseRakutenCard==='function'?parseRakutenCard:null;
  if(prevRakuten){parseRakutenCard=function parseRakutenCardV57(src,file){const result=prevRakuten(src,file),scan=exactRakutenScan(src,file),st=(typeof state!=='undefined'?state:stateNow());if(scan){applyExactRakuten(st,scan,file);result.billingTotalExact=scan.total;result.billingAdjustmentCount=scan.adjustmentCount;result.billingAdjustmentTotal=scan.adjustmentTotal;result.billingReconciled=true}return result}}

  function recordName(kind,o){return kind==='purchase'?(o.merchant_raw||o.merchant_normalized||''):(o.description_raw||o.description||'')}
  function recordId(kind,o,i){return kind==='purchase'?String(o.purchase_id||`purchase:${i}`):String(o.id||`cash:${i}`)}
  function ruleMatches(st,kind,o){const sem=window.householdSemanticV47,key=sem?.ruleKey?.(kind,o)||`${kind}|${norm(recordName(kind,o))}`,name=norm(recordName(kind,o));return (st.automationRules||[]).filter(r=>r.active!==false&&((r.match?.key&&String(r.match.key)===key)||(!r.match?.key&&norm(r.match?.name||'')===name)))}
  function autoResolveKnown(st){
    const sem=window.householdSemanticV47;let changed=!!sem?.applyAutomationRules?.(st);
    const apply=(kind,o)=>{if(o.review_status==='RESOLVED'||o.reviewed_at){if(Number(o.confidence)!==1){o.confidence=1;changed=true}return}const hits=ruleMatches(st,kind,o);if(hits.length!==1)return;const complete=String(o.economic_type||'UNKNOWN')!=='UNKNOWN'&&(o.economic_type!=='EXPENSE'||!!o.category);if(!complete)return;if(Number(o.confidence)!==1){o.confidence=1;changed=true}if(o.review_status!=='AUTO_RESOLVED'){o.review_status='AUTO_RESOLVED';changed=true}o.classification_rule_id=hits[0].id;o.classification_source='automation-rule-v57'};
    (st.purchaseEvents||[]).forEach(o=>apply('purchase',o));(st.cashTransactions||[]).forEach(o=>apply('cash',o));
    const seen=new Set();const before=(st.reviewQueue||[]).length;st.reviewQueue=(st.reviewQueue||[]).filter(q=>{const k=[q.source||'',q.date||'',norm(q.merchant||q.description||'')].join('|');if(seen.has(k))return false;seen.add(k);const name=norm(q.merchant||q.description||'');const resolved=[...(st.purchaseEvents||[]),...(st.cashTransactions||[])].some(o=>norm(o.merchant_raw||o.merchant_normalized||o.description_raw||o.description||'')===name&&Number(o.confidence)>=.7&&String(o.economic_type||'UNKNOWN')!=='UNKNOWN'&&(o.economic_type!=='EXPENSE'||!!o.category));return !resolved});if(st.reviewQueue.length!==before)changed=true;
    return changed;
  }
  function saveAndRemember(card){
    const kind=card.dataset.v48Kind,id=card.dataset.v48Id,st=stateNow(),arr=kind==='purchase'?(st.purchaseEvents||[]):st.cashTransactions||[],o=arr.find((x,i)=>recordId(kind,x,i)===String(id));if(!o)return;
    const econ=card.querySelector('[data-v48-econ]')?.value||'UNKNOWN',spend=card.querySelector('[data-v48-spend]')?.value||'NORMAL',cat=card.querySelector('[data-v48-cat]')?.value||null,sub=card.querySelector('[data-v48-sub]')?.value||null;
    Object.assign(o,{economic_type:econ,spending_class:econ==='EXPENSE'?spend:null,category:econ==='EXPENSE'?cat:null,subcategory:econ==='EXPENSE'?sub:null,expense_scope:econ==='EXPENSE'?spend:econ==='INVESTMENT'?'INVESTMENT':String(econ).startsWith('DEBT_')?'DEBT':econ==='TRANSFER'?'TRANSFER':econ==='INCOME'?'INCOME':null,ordinary_or_special:econ==='EXPENSE'?spend:econ==='INVESTMENT'?'INVESTMENT':String(econ).startsWith('DEBT_')?'DEBT':econ==='TRANSFER'?'TRANSFER':econ==='INCOME'?'INCOME':null,confidence:1,review_status:'RESOLVED',reviewed_at:new Date().toISOString()});
    st.automationRules=Array.isArray(st.automationRules)?st.automationRules:[];const sem=window.householdSemanticV47,name=recordName(kind,o),key=sem?.ruleKey?.(kind,o)||`${kind}|${norm(name)}`;let rule=st.automationRules.find(r=>r.active!==false&&String(r.match?.key||'')===key);const actions={economic_type:econ,spending_class:econ==='EXPENSE'?spend:null,category:econ==='EXPENSE'?cat:null,subcategory:econ==='EXPENSE'?sub:null};if(rule){rule.actions=actions;rule.updatedAt=new Date().toISOString()}else st.automationRules.push({id:`rule:${crypto.randomUUID()}`,active:true,match:{kind,key,name},actions,source:'v57-default-remember',createdAt:new Date().toISOString()});
    st.reviewQueue=(st.reviewQueue||[]).filter(q=>norm(q.merchant||q.description||'')!==norm(name));autoResolveKnown(st);window.treasuryRecoverySnapshot?.('分類保存直前');window.replaceTreasuryState?.(st);window.setTreasurySaveStatus?.('分類を記憶して保存・同期中');window.cloudSyncOnLocalSave?.();setTimeout(()=>window.renderSemanticUiV48?.(),0);
  }
  document.addEventListener('click',e=>{const b=e.target.closest?.('[data-v48-review-save],[data-v48-review-remember]');if(!b)return;const card=b.closest('[data-v48-kind]');if(!card)return;e.preventDefault();e.stopImmediatePropagation();saveAndRemember(card)},true);

  function patchLegacyReviewUi(){const old=$('expenseScopeCardV34');if(old)old.style.display='none';const old2=$('reviewCenterCardV40');if(old2)old2.style.display='none';document.querySelectorAll('[data-v48-review-remember]').forEach(b=>b.style.display='none');document.querySelectorAll('[data-v48-review-save]').forEach(b=>b.textContent='保存（次回から自動）')}

  function patchFutureActions(){
    const body=$('eventsBody');if(!body||typeof forecast!=='function')return;const h=Number($('forecastHorizon')?.value)||90,rows=forecast(h).rows,tr=[...body.querySelectorAll('tr')],st=stateNow();tr.forEach((row,i)=>{const e=rows[i];if(!e)return;const parent=String(e.parent_event_id||((st.events||[]).some(x=>String(x.id)===String(e.id))?e.id:''));if(!parent)return;const cell=row.lastElementChild;if(!cell)return;cell.innerHTML=`<div class="controls" style="justify-content:flex-end"><button class="btn secondary" data-v57-future-edit="${esc(parent)}">編集</button><button class="btn danger" data-v57-future-del="${esc(parent)}">削除</button></div>`})
  }
  document.addEventListener('click',e=>{const edit=e.target.closest?.('[data-v57-future-edit]'),del=e.target.closest?.('[data-v57-future-del]');if(!edit&&!del)return;const id=(edit||del).dataset[edit?'v57FutureEdit':'v57FutureDel'],selector=edit?`[data-future-edit="${CSS.escape(id)}"]`:`[data-future-del="${CSS.escape(id)}"]`,target=document.querySelector(`#futurePlannerCardV37 ${selector}`);target?.click()},true);

  const prevImport=typeof importOne==='function'?importOne:null;
  if(prevImport){importOne=async function importOneV57(file){const result=await prevImport(file),st=stateNow();if(autoResolveKnown(st)){window.replaceTreasuryState?.(st);window.cloudSyncOnLocalSave?.()}setTimeout(()=>{window.renderSemanticUiV48?.();patchLegacyReviewUi();patchFutureActions();window.renderCardClaimsV56?.()},0);return result}}

  function diagnostics(){const st=stateNow(),s=(st.cardSettlements||[]).find(x=>isRakuten(x.card)&&String(x.due_date||'').startsWith('2026-09'));if(!s)return;window.__treasuryV57Diagnostics={rakuten202609:{statement:Number(s.amount)||0,details:Number(s.detail_payment_total)||0,difference:Number(s.detail_difference)||0,audit:s.billing_audit||null}}}
  function patchAll(){patchLegacyReviewUi();patchFutureActions();diagnostics()}
  function queue(){clearTimeout(patchTimer);patchTimer=setTimeout(patchAll,60)}
  function boot(){const st=stateNow();if(autoResolveKnown(st)){window.replaceTreasuryState?.(st);window.cloudSyncOnLocalSave?.()}patchAll();const body=$('eventsBody');if(body)new MutationObserver(queue).observe(body,{childList:true,subtree:true});const main=document.querySelector('main.app');if(main)new MutationObserver(queue).observe(main,{childList:true,subtree:true});document.addEventListener('change',e=>{if(e.target?.id==='forecastHorizon')setTimeout(patchFutureActions,0)});window.addEventListener('focus',queue);window.treasuryIntegrityV57={writeMasterGuard:()=>writeGuard(stateNow().masters,'manual'),patchAll,autoResolveKnown,exactRakutenScan}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
})();
