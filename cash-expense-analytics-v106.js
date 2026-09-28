
(() => {
  if (window.__cashExpenseAnalyticsV106) return;
  window.__cashExpenseAnalyticsV106 = true;

  const $ = id => document.getElementById(id);
  const yen = n => new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
  const esc = s => String(s ?? '').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const stateNow = () => (window.getTreasuryStateRaw || window.getTreasuryState)?.() || {};
  const currentMonth = () => new Date().toISOString().slice(0,7);
  const LABELS={HOUSING:'住居',UTILITIES:'公共料金',COMMUNICATION:'通信',FOOD:'食費',DAILY_GOODS:'日用品',CHILD:'子ども',MEDICAL:'医療',INSURANCE:'保険',CAR:'車',TRANSPORT:'交通',SUBSCRIPTION:'サブスク・会費',ENTERTAINMENT:'娯楽',TRAVEL:'旅行',EDUCATION:'教育',TAX:'税・公的負担',FINANCIAL_FEES:'金融手数料',PERSONAL:'個人',GIFTS_EVENTS:'イベント・贈答',OTHER:'その他'};
  const JP={住居:'HOUSING',家賃:'HOUSING',公共料金:'UTILITIES',光熱費:'UTILITIES',電気:'UTILITIES',水道:'UTILITIES',ガス:'UTILITIES',通信:'COMMUNICATION',携帯:'COMMUNICATION',インターネット:'COMMUNICATION',食費:'FOOD',食料品:'FOOD',スーパー:'FOOD',外食:'FOOD',カフェ:'FOOD',日用品:'DAILY_GOODS',衣服:'DAILY_GOODS',服:'DAILY_GOODS',子ども:'CHILD',育児:'CHILD',保育:'CHILD',医療:'MEDICAL',病院:'MEDICAL',歯科:'MEDICAL',薬:'MEDICAL',保険:'INSURANCE',車:'CAR',ガソリン:'CAR',駐車場:'CAR',高速:'CAR',ETC:'CAR',交通:'TRANSPORT',電車:'TRANSPORT',バス:'TRANSPORT',タクシー:'TRANSPORT',サブスク:'SUBSCRIPTION',会費:'SUBSCRIPTION',娯楽:'ENTERTAINMENT',趣味:'ENTERTAINMENT',旅行:'TRAVEL',宿泊:'TRAVEL',教育:'EDUCATION',書籍:'EDUCATION',税:'TAX',税金:'TAX',手数料:'FINANCIAL_FEES',利息:'FINANCIAL_FEES',個人:'PERSONAL',美容:'PERSONAL',フィットネス:'PERSONAL',その他:'OTHER'};

  function semantic(){return window.householdSemanticV47||null}
  function categoryLabel(k){return semantic()?.CATEGORY_DEFS?.[k]?.label||LABELS[k]||k||'その他'}
  function scope(v){const s=String(v||'').trim().normalize('NFKC').toUpperCase();return ['SPECIAL','特別','特別費','臨時','臨時費'].includes(s)?'SPECIAL':'NORMAL'}
  function category(raw,name){
    const s=String(raw||'').trim(),sem=semantic(),mapped=sem?.normalizeCategoryValue?.(s);
    if(mapped)return mapped;
    const inferred=sem?.inferCategory?.(name,s);if(inferred)return inferred;
    const jp=JP[s]||JP[s.toUpperCase()];if(jp)return jp;
    return'OTHER';
  }
  function num(v){const s=String(v??'').replace(/[¥￥,\s]/g,'');return /^[-+]?\d+(?:\.\d+)?$/.test(s)?Number(s):null}
  function date(v){const s=String(v||'').trim();if(/^\d{8}$/.test(s))return s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8);const m=s.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);return m?m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0'):s}
  function parseCsv(text){
    if(window.parseCsvV73)return window.parseCsvV73(text);
    const out=[];let row=[],cell='',q=false,s=String(text||'').replace(/^\uFEFF/,'');
    for(let i=0;i<s.length;i++){const c=s[i];if(c==='"'){if(q&&s[i+1]==='"'){cell+='"';i++}else q=!q}else if(c===','&&!q){row.push(cell.trim());cell=''}else if((c==='\n'||c==='\r')&&!q){if(c==='\r'&&s[i+1]==='\n')i++;row.push(cell.trim());cell='';if(row.some(x=>x))out.push(row);row=[]}else cell+=c}
    if(cell||row.length){row.push(cell.trim());if(row.some(x=>x))out.push(row)}return out
  }
  function idx(h,aliases){const a=h.map(x=>String(x||'').trim().normalize('NFKC').toLowerCase());for(const x of aliases){const i=a.indexOf(String(x).normalize('NFKC').toLowerCase());if(i>=0)return i}return-1}
  function decode(buf){let u='',s='';try{u=new TextDecoder('utf-8').decode(buf)}catch{}try{s=new TextDecoder('shift-jis').decode(buf)}catch{}const score=t=>['日付','内容','金額','カテゴリー','区分'].reduce((n,x)=>n+(t.includes(x)?1:0),0)-(t.match(/�/g)||[]).length;return score(u)>=score(s)?{text:u,encoding:'utf-8'}:{text:s,encoding:'shift-jis'}}
  function detect(file,buf){
    const d=decode(buf),rows=parseCsv(d.text);if(!rows.length)return null;
    const hi=rows.findIndex(r=>idx(r,['日付','支出日','date'])>=0&&idx(r,['内容','用途','明細','摘要','description'])>=0&&idx(r,['金額','支出額','amount'])>=0&&idx(r,['カテゴリー','category'])>=0&&idx(r,['区分','通常特別','spending_class','scope'])>=0);
    return hi<0?null:{rows,hi,encoding:d.encoding}
  }
  function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return(h>>>0).toString(16)}
  async function sha(buf){const d=await crypto.subtle.digest('SHA-256',buf);return[...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('')}
  function key(x){return[x.date,x.description,Number(x.amount)||0,x.category,x.spending_class].join('|')}

  function parseCash(info,file,st){
    st.cashExpenses=Array.isArray(st.cashExpenses)?st.cashExpenses:[];
    const h=info.rows[info.hi],di=idx(h,['日付','支出日','date']),ni=idx(h,['内容','用途','明細','摘要','description']),ai=idx(h,['金額','支出額','amount']),ci=idx(h,['カテゴリー','category']),si=idx(h,['区分','通常特別','spending_class','scope']),subi=idx(h,['サブカテゴリー','subcategory']),notei=idx(h,['メモ','備考','note']);
    const seen=new Set(st.cashExpenses.map(key));let added=0,duplicates=0,invalid=0;
    for(const r of info.rows.slice(info.hi+1)){
      const d=date(r[di]),name=String(r[ni]||'').trim(),n=num(r[ai]);if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||!name||n===null||n===0){invalid++;continue}
      const c=category(r[ci],name),sc=scope(r[si]),amount=Math.abs(n),explicitSub=subi>=0&&r[subi]?String(r[subi]).trim().toUpperCase():null,sub=explicitSub||semantic()?.inferSubcategory?.(c,name,null)||'OTHER',rec={id:'cash-expense:'+hash([d,name,amount,c,sc].join('|')),record_kind:'CASH_EXPENSE',economic_type:'EXPENSE',spending_class:sc,expense_scope:sc,ordinary_or_special:sc==='SPECIAL'?'SPECIAL':'ORDINARY',category:c,subcategory:sub,date:d,description:name,amount,payment_method:'CASH',source:'Cash CSV',source_file:file.name,note:notei>=0?String(r[notei]||'').trim():'',imported_at:new Date().toISOString()};
      const k=key(rec);if(seen.has(k)){duplicates++;continue}seen.add(k);st.cashExpenses.push(rec);added++
    }
    st.cashExpenses.sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    return{added,duplicates,review:invalid,invalid,read:Math.max(0,info.rows.length-info.hi-1),autoClassified:added,source:'現金支出',latest:st.cashExpenses.map(x=>x.date).sort().at(-1)||'',encoding:info.encoding,detectedType:'cash_expense'}
  }

  const prevImport=typeof importOne==='function'?importOne:null;
  if(prevImport)importOne=async function(file){
    const buf=await file.arrayBuffer(),info=detect(file,buf);if(!info)return prevImport(file);
    const st=stateNow(),digest=await sha(buf);st.imports=Array.isArray(st.imports)?st.imports:[];
    if(st.imports.some(x=>x.sha256===digest))return{source:'重複ファイル',added:0,duplicates:1,review:0,read:0,skipped:true,detectedType:'cash_expense',encoding:info.encoding};
    const result=parseCash(info,file,st);st.imports.unshift(Object.assign({at:new Date().toISOString(),file:file.name,sha256:digest,type:'cash_expense'},result));
    window.treasuryRecoverySnapshot?.('現金支出CSV取込前');window.replaceTreasuryState?.(st);window.setTreasurySaveStatus?.('現金支出 '+result.added+'件取込済み・同期中');window.cloudSyncOnLocalSave?.();setTimeout(()=>window.renderDashboardV39?.(),0);return result
  };

  function scopeOf(o){return String(o?.spending_class||o?.expense_scope||o?.ordinary_or_special||'').toUpperCase()==='SPECIAL'?'SPECIAL':'NORMAL'}
  function categoryOf(o,name){return semantic()?.normalizeCategoryValue?.(o?.category)||semantic()?.inferCategory?.(name,o?.category)||category(o?.category,name)}
  function bankExpense(t){
    if(Number(t?.amount)>=0)return false;
    const e=String(t?.economic_type||'').toUpperCase();
    // Only an explicit later user edit overrides structural bank semantics.
    // Imported/automatic EXPENSE labels must not turn ATM withdrawals or card
    // settlements back into spending.
    const manuallyEdited=Number(t?.semantic_transaction_edit_version)>=108||t?.semantic_manual_override===true;
    if(manuallyEdited&&e&&e!=='UNKNOWN')return e==='EXPENSE';
    if(t?.is_transfer)return false;
    const cf=String(t?.cashflow_type||'').toUpperCase();
    if(['CARD_SETTLEMENT','CASH_WITHDRAWAL_UNCLASSIFIED','INTERNAL_TRANSFER','TRANSFER','INVESTMENT_CONTRIBUTION','DEBT_PRINCIPAL','DEBT_INTEREST'].includes(cf))return false;
    if(e&&e!=='EXPENSE'&&e!=='UNKNOWN')return false;
    return true
  }
  function collectRows(st,month=currentMonth()){
    const out=[];
    for(const [i,p] of (st.purchaseEvents||[]).entries()){const d=String(p.purchase_date||'');if(d.slice(0,7)!==month)continue;const a=Math.abs(Number(p.original_amount)||0);if(!a)continue;const n=p.merchant_raw||p.merchant_normalized||'カード利用';out.push({kind:'card',editKind:'purchase',editId:String(p.purchase_id||'purchase:'+i),date:d,name:n,amount:a,scope:scopeOf(p),category:categoryOf(p,n),source:p.card?'カード · '+p.card:'カード'})}
    for(const [i,t] of (st.cashTransactions||[]).entries()){const d=String(t.date||'');if(d.slice(0,7)!==month||!bankExpense(t))continue;const a=Math.abs(Number(t.amount)||0),n=t.description_raw||t.description||'銀行支出';if(a)out.push({kind:'bank',editKind:'cash',editId:String(t.id||'cash:'+i),date:d,name:n,amount:a,scope:scopeOf(t),category:categoryOf(t,n),source:t.source||'銀行'})}
    for(const c of st.cashExpenses||[]){const d=String(c.date||'');if(d.slice(0,7)!==month)continue;const a=Math.abs(Number(c.amount)||0),n=c.description||'現金支出';if(a)out.push({kind:'cash',date:d,name:n,amount:a,scope:scopeOf(c),category:categoryOf(c,n),source:'現金'})}
    return out.sort((a,b)=>String(b.date).localeCompare(String(a.date)))
  }
  function summarize(st,month=currentMonth()){
    const rows=collectRows(st,month),maps={NORMAL:new Map(),SPECIAL:new Map()},totals={NORMAL:0,SPECIAL:0};
    for(const r of rows){const s=r.scope==='SPECIAL'?'SPECIAL':'NORMAL';totals[s]+=r.amount;const g=maps[s].get(r.category)||{category:r.category,label:categoryLabel(r.category),amount:0,count:0};g.amount+=r.amount;g.count++;maps[s].set(r.category,g)}
    const sort=m=>[...m.values()].sort((a,b)=>b.amount-a.amount||a.label.localeCompare(b.label,'ja'));return{month,rows,totals,normal:sort(maps.NORMAL),special:sort(maps.SPECIAL)}
  }
  const prevTotals=typeof monthEconomicTotals==='function'?monthEconomicTotals:null;
  function monthTotals(month=null){const st=stateNow(),m=month||currentMonth(),s=summarize(st,m);let b={ordinary:0,special:0,investment:0,debt:0,transfer:0,income:0};try{if(prevTotals)b=prevTotals(m)||b}catch{}return Object.assign({},b,{ordinary:s.totals.NORMAL,normal:s.totals.NORMAL,special:s.totals.SPECIAL})}
  try{monthEconomicTotals=monthTotals}catch{window.monthEconomicTotals=monthTotals}

  function categoryButtonsHtml(sc,groups,month){
    return groups.length?groups.map(g=>'<button type="button" class="btn secondary" data-expense-detail="1" data-expense-scope="'+sc+'" data-expense-category="'+esc(g.category)+'" data-expense-month="'+esc(month)+'" style="width:100%;display:flex;justify-content:space-between;align-items:center;text-align:left;margin-top:6px"><span><b>'+esc(g.label)+'</b><span class="tiny" style="margin-left:7px">'+g.count+'件</span></span><b>'+yen(g.amount)+'</b></button>').join(''):'<div class="muted" style="padding:8px 0">該当支出なし</div>'
  }
  function scopeHtml(sc,label,total,groups,month){
    const body=categoryButtonsHtml(sc,groups,month);
    return'<div style="margin-top:10px"><button type="button" class="btn secondary" data-expense-scope-toggle="1" data-expense-scope="'+sc+'" aria-expanded="false" style="width:100%;display:flex;justify-content:space-between;align-items:center;text-align:left"><span><b>'+label+'</b><span class="tiny" style="margin-left:7px">'+groups.length+'カテゴリー</span></span><b>'+yen(total)+'</b></button><div data-expense-category-list="'+sc+'" style="display:none;padding:2px 0 4px 12px">'+body+'</div></div>'
  }
  function renderDashboardMonth(st,month=currentMonth()){
    const s=summarize(st,month),p=month.split('-');return'<div class="tiny" style="margin-bottom:4px">'+Number(p[0])+'年'+Number(p[1])+'月 · 通常費 / 特別費 → カテゴリー → 明細</div>'+scopeHtml('NORMAL','通常費',s.totals.NORMAL,s.normal,month)+scopeHtml('SPECIAL','特別費',s.totals.SPECIAL,s.special,month)+'<div class="tiny" style="margin-top:10px">カード引落・ATM現金引出・口座移動は二重計上防止のため支出集計外です。</div>'
  }
  function modal(){
    let m=$('expenseDetailModalV106');if(m)return m;m=document.createElement('div');m.id='expenseDetailModalV106';m.style.cssText='display:none;position:fixed;inset:0;z-index:9999;background:rgba(3,8,20,.72);padding:14px;overflow:auto';m.innerHTML='<div class="card" style="max-width:680px;margin:5vh auto;max-height:86vh;overflow:auto"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><div><div class="title" id="expenseDetailTitleV106" style="margin:0"></div><div class="tiny" id="expenseDetailMetaV106"></div></div><button type="button" class="btn secondary" data-expense-close="1">閉じる</button></div><div id="expenseDetailRowsV106" style="margin-top:10px"></div></div>';document.body.appendChild(m);m.addEventListener('click',e=>{if(e.target===m||e.target.closest?.('[data-expense-close]'))m.style.display='none'});return m
  }
  function openDetail(sc,cat,month){const rows=collectRows(stateNow(),month).filter(r=>r.scope===sc&&r.category===cat),m=modal();$('expenseDetailTitleV106').textContent=(sc==='SPECIAL'?'特別費':'通常費')+' · '+categoryLabel(cat);$('expenseDetailMetaV106').textContent=month+' · '+rows.length+'件 · 合計 '+yen(rows.reduce((a,r)=>a+r.amount,0));$('expenseDetailRowsV106').innerHTML=rows.length?rows.map(r=>'<div class="row" style="align-items:flex-start;gap:10px"><div style="min-width:0;flex:1"><b>'+esc(r.name)+'</b><div class="tiny">'+esc(r.date)+' · '+esc(r.source)+'</div></div><div style="text-align:right"><b class="amt bad">-'+yen(r.amount)+'</b>'+(r.editKind&&r.editId?'<div style="margin-top:5px"><button type="button" class="btn secondary" data-expense-edit="1" data-expense-edit-kind="'+esc(r.editKind)+'" data-expense-edit-id="'+esc(r.editId)+'">編集</button></div>':'')+'</div></div>').join(''):'<div class="muted">明細なし</div>';m.style.display='block'}

  function picker(){const l=$('mobileCsvPickerV73'),s=l?.querySelector('.tiny');if(s)s.textContent='銀行・カード・現金支出。複数ファイル選択可'}
  function boot(){const st=stateNow();if(!Array.isArray(st.cashExpenses)){st.cashExpenses=[];window.replaceTreasuryState?.(st)}modal();picker();document.addEventListener('click',e=>{const edit=e.target.closest?.('[data-expense-edit="1"]');if(edit){const m=$('expenseDetailModalV106');if(m)m.style.display='none';window.openSemanticTransactionEditorV108?.(edit.dataset.expenseEditKind,edit.dataset.expenseEditId);return}const t=e.target.closest?.('[data-expense-scope-toggle="1"]');if(t){const list=t.parentElement?.querySelector?.('[data-expense-category-list="'+t.dataset.expenseScope+'"]');if(list){const opening=list.style.display==='none';list.style.display=opening?'block':'none';t.setAttribute('aria-expanded',opening?'true':'false')}return}const b=e.target.closest?.('[data-expense-detail="1"]');if(b){openDetail(b.dataset.expenseScope,b.dataset.expenseCategory,b.dataset.expenseMonth);return}if(e.target.closest?.('[data-page="imports"]'))setTimeout(()=>picker(),0)});window.addEventListener('treasury:pagechange',e=>{if(e?.detail?.page==='imports')setTimeout(()=>picker(),0);if(e?.detail?.page==='dashboard')setTimeout(()=>window.renderDashboardV39?.(),0)});setTimeout(()=>window.renderDashboardV39?.(),0)}
  window.householdExpenseAnalyticsV106={collectRows,summarize,renderDashboardMonth,parseCashExpenseCsv:parseCash,cashCsvInfo:detect,categoryLabel,monthTotals};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0)
})();
