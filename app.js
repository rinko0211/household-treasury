const KEY='householdTreasuryMVP';
const SCHEMA_VERSION=2;
const empty=()=>({
  schemaVersion:SCHEMA_VERSION,
  settings:{cash:0,reserve:0,salary:0,salaryDay:18,reservedSpecial:0},
  assets:{bank:0,investment:0,ideco:0,other:0,liabilities:0,revolvingBalance:0},
  rules:[],events:[],overrides:[],history:[],imports:[],
  cashTransactions:[],purchaseEvents:[],cardSettlements:[],investmentEvents:[],assetSnapshots:[],reviewQueue:[],
  importRules:null
});
let state=empty();
const $=id=>document.getElementById(id);
const yen=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
const iso=d=>{const x=new Date(d);return Number.isNaN(x.getTime())?'':`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`};
const ym=d=>iso(d).slice(0,7);
const today=()=>iso(new Date());
const normalizeText=s=>String(s??'').normalize('NFKC').replace(/[\s　]+/g,'').toUpperCase();
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const hash32=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return(h>>>0).toString(16)};

function normalize(){
  const legacyAssets=state.assets||{};
  if(Array.isArray(state.wealth)&&!Array.isArray(state.history))state.history=state.wealth.map(r=>({month:r[0],bank:+r[1]||0,investment:+r[2]||0,ideco:0,liabilities:+r[3]||0,other:(+r[4]||0)-(+r[1]||0)-(+r[2]||0)+(+r[3]||0)}));
  if(Array.isArray(state.importHistory)&&!Array.isArray(state.imports))state.imports=state.importHistory;
  state.settings={...empty().settings,...state.settings};
  state.assets={...empty().assets,...legacyAssets,bank:legacyAssets.bank??legacyAssets.workingCash??state.settings.cash??0,other:legacyAssets.other??legacyAssets.otherBank??0,liabilities:legacyAssets.liabilities??legacyAssets.liability??0};
  for(const k of ['rules','events','overrides','history','imports','cashTransactions','purchaseEvents','cardSettlements','investmentEvents','assetSnapshots','reviewQueue'])if(!Array.isArray(state[k]))state[k]=[];
  if(!state.assets.bank&&state.settings.cash)state.assets.bank=state.settings.cash;
  state.schemaVersion=SCHEMA_VERSION;
}
function load(){try{state=JSON.parse(localStorage.getItem(KEY))||empty()}catch{state=empty()}normalize();injectUi()}
function save(){localStorage.setItem(KEY,JSON.stringify(state));$('saveStatus').textContent='ローカル保存済み';window.cloudSyncOnLocalSave?.()}
function lastDay(y,m){return new Date(y,m,0).getDate()}
function ruleDate(y,m,d){return `${y}-${String(m).padStart(2,'0')}-${String(Math.min(d,lastDay(y,m))).padStart(2,'0')}`}
function nextSalaryDate(){const now=new Date(),day=Number(state.settings.salaryDay)||18;let d=new Date(now.getFullYear(),now.getMonth(),Math.min(day,lastDay(now.getFullYear(),now.getMonth()+1)));if(iso(d)<today())d=new Date(now.getFullYear(),now.getMonth()+1,Math.min(day,lastDay(now.getFullYear(),now.getMonth()+2)));return iso(d)}

function generated(days=90){
  const from=new Date();from.setHours(0,0,0,0);const to=new Date(from);to.setDate(to.getDate()+days);
  let out=[...state.events];
  for(let d=new Date(from.getFullYear(),from.getMonth(),1);d<=to;d.setMonth(d.getMonth()+1)){
    const y=d.getFullYear(),m=d.getMonth()+1,month=`${y}-${String(m).padStart(2,'0')}`;
    for(const r of state.rules.filter(x=>x.enabled!==false)){
      let amount=Number(r.amount)||0;const o=state.overrides.find(x=>x.name===r.name&&x.month===month);if(o)amount=Number(o.amount)||0;
      out.push({id:`rule:${r.id}:${month}`,date:ruleDate(y,m,r.day||1),name:r.name,amount,type:r.type||'fixed',ordinary_or_special:r.ordinary_or_special||'ORDINARY',generated:true,source:'rule'});
    }
  }
  for(const s of state.cardSettlements){
    if(!s.due_date)continue;
    const amount=-Math.abs(Number(s.amount)||0);
    if(!amount)continue;
    const duplicate=out.some(e=>e.date===s.due_date&&Number(e.amount)===amount);
    if(!duplicate)out.push({id:`settlement:${s.settlement_id}`,date:s.due_date,name:`${s.card}カード支払`,amount,type:'CARD_SETTLEMENT',ordinary_or_special:'DEBT',generated:true,source:'card_settlement'});
  }
  return out.filter(e=>e.date>=iso(from)&&e.date<=iso(to)).sort((a,b)=>a.date.localeCompare(b.date)||String(a.name).localeCompare(String(b.name)));
}
function forecast(days=90){
  let bal=Number(state.settings.cash)||0,low=bal,lowDate=today(),rows=[];
  for(const e of generated(days)){bal+=Number(e.amount)||0;rows.push({...e,balance:bal});if(bal<low){low=bal;lowDate=e.date}}
  const safety=Number(state.settings.reserve)||0,reserved=Number(state.settings.reservedSpecial)||0;
  return{rows,low,lowDate,safeToSpend:Math.max(0,low-safety-reserved),endBalance:bal};
}
function forecastUntil(date){const days=Math.max(0,Math.ceil((new Date(date)-new Date(today()))/86400000));return forecast(days)}
function net(){const a=state.assets;return (a.bank||0)+(a.investment||0)+(a.ideco||0)+(a.other||0)-(a.liabilities||0)}
function monthEconomicTotals(){
  const m=ym(new Date());let ordinary=0,special=0,investment=0,debt=0;
  for(const p of state.purchaseEvents.filter(x=>String(x.purchase_date||'').startsWith(m))){const a=Math.abs(Number(p.original_amount)||0);if(p.ordinary_or_special==='SPECIAL')special+=a;else if(p.ordinary_or_special==='INVESTMENT')investment+=a;else if(p.ordinary_or_special==='DEBT')debt+=a;else ordinary+=a}
  for(const t of state.cashTransactions.filter(x=>String(x.date||'').startsWith(m))){const a=Math.abs(Math.min(0,Number(t.amount)||0));if(!a)continue;if(t.cashflow_type==='INVESTMENT_CONTRIBUTION')investment+=a;else if(t.cashflow_type==='DEBT_PRINCIPAL'||t.cashflow_type==='DEBT_INTEREST')debt+=a;else if(!t.is_transfer&&!['CARD_SETTLEMENT'].includes(t.cashflow_type)){if(t.ordinary_or_special==='SPECIAL')special+=a;else ordinary+=a}}
  return{ordinary,special,investment,debt};
}

function injectUi(){
  const cashLabel=$('kpiCash')?.parentElement?.querySelector('.muted');if(cashLabel)cashLabel.textContent='現在現金';
  const safeLabel=$('kpiInvest')?.parentElement?.querySelector('.muted');if(safeLabel)safeLabel.textContent='安全に使える額';
  if(!$('kpiMonthEnd')){
    const dash=document.querySelector('#dashboard .grid');
    const card=document.createElement('div');card.className='card full';card.innerHTML=`<div class="title">資金繰りサマリー</div><div class="form"><div><span class="muted">今月末予測</span><b id="kpiMonthEnd" style="display:block;font-size:22px;margin-top:6px">—</b></div><div><span class="muted">次の給与まで最低</span><b id="kpiNextSalaryLow" style="display:block;font-size:22px;margin-top:6px">—</b><div class="tiny" id="kpiNextSalaryDate"></div></div><div><span class="muted">今月通常生活費</span><b id="kpiOrdinary" style="display:block;font-size:22px;margin-top:6px">—</b></div><div><span class="muted">今月特別費 / 投資</span><b id="kpiSpecialInv" style="display:block;font-size:22px;margin-top:6px">—</b></div></div>`;dash.appendChild(card);
  }
  if(!$('forecastHorizon')){
    const host=document.querySelector('#cashflow .card');const controls=host.querySelector('.controls');
    const sel=document.createElement('select');sel.id='forecastHorizon';sel.innerHTML='<option value="30">30日</option><option value="60">60日</option><option value="90" selected>90日</option>';sel.onchange=render;controls.prepend(sel);
  }
  if(!$('importSummary')){
    const host=document.querySelector('#imports .grid');const d=document.createElement('div');d.className='card full';d.innerHTML='<div class="title">Import Summary</div><div id="importSummary" class="muted">まだ取込はありません。</div><div id="reviewQueue" style="margin-top:10px"></div>';host.appendChild(d);
  }
  if(!$('reservedSpecial')){
    const f=document.querySelector('#settings .form');const d=document.createElement('div');d.className='field';d.innerHTML='<label>予約済み特別費</label><input id="reservedSpecial" type="number">';f.appendChild(d);
  }
}

function render(){
  const horizon=Number($('forecastHorizon')?.value)||90,f=forecast(horizon),f90=forecast(90),monthEnd=forecastUntil(`${ym(new Date())}-${String(lastDay(new Date().getFullYear(),new Date().getMonth()+1)).padStart(2,'0')}`),salaryF=forecastUntil(nextSalaryDate()),tot=monthEconomicTotals();
  $('kpiNet').textContent=yen(net());$('kpiCash').textContent=yen(state.settings.cash);$('kpiLow').textContent=yen(f90.low);$('kpiLowDate').textContent=f90.lowDate;$('kpiInvest').textContent=yen(f90.safeToSpend);$('kpiInvest').className=f90.safeToSpend>100000?'good':f90.safeToSpend>0?'warn':'bad';
  $('safety').innerHTML=f90.low>=state.settings.reserve?`90日最低残高は安全資金を <b>${yen(f90.low-state.settings.reserve)}</b> 上回ります。`:`安全資金を <b>${yen(state.settings.reserve-f90.low)}</b> 下回る見込みです。`;
  $('nextEvents').innerHTML=f90.rows.slice(0,8).map(e=>`<div class="row"><div>${esc(e.name)}<div class="tiny">${e.date} · ${esc(e.type||'')}</div></div><div class="amt ${e.amount<0?'bad':'good'}">${e.amount>0?'+':''}${yen(e.amount)}</div></div>`).join('')||'<div class="muted">予定なし</div>';
  const a=state.assets;$('assets').innerHTML=[['預金/流動',a.bank],['投資',a.investment],['iDeCo',a.ideco],['その他',a.other],['負債',-a.liabilities],['リボ残高',-a.revolvingBalance]].map(x=>`<div class="row"><span>${x[0]}</span><span class="amt">${yen(x[1])}</span></div>`).join('');
  $('eventsBody').innerHTML=f.rows.map(e=>`<tr><td>${e.date}</td><td>${esc(e.name)}</td><td>${esc(e.type||'')}</td><td class="${e.amount<0?'bad':'good'}">${e.amount>0?'+':''}${yen(e.amount)}</td><td>${yen(e.balance)}</td><td>${e.generated?'':`<button class="btn secondary" onclick="delEvent('${e.id}')">削除</button>`}</td></tr>`).join('');
  $('wealthBody').innerHTML=[...state.history].reverse().map(h=>`<tr><td>${h.month}</td><td>${yen(h.bank)}</td><td>${yen((h.investment||0)+(h.ideco||0)+(h.other||0))}</td><td>${yen(h.liabilities||0)}</td><td>${yen((h.bank||0)+(h.investment||0)+(h.ideco||0)+(h.other||0)-(h.liabilities||0))}</td></tr>`).join('');
  $('cash').value=state.settings.cash;$('reserve').value=state.settings.reserve;$('salary').value=state.settings.salary;$('salaryDay').value=state.settings.salaryDay;if($('reservedSpecial'))$('reservedSpecial').value=state.settings.reservedSpecial||0;
  if($('kpiMonthEnd'))$('kpiMonthEnd').textContent=yen(monthEnd.endBalance);if($('kpiNextSalaryLow'))$('kpiNextSalaryLow').textContent=yen(salaryF.low);if($('kpiNextSalaryDate'))$('kpiNextSalaryDate').textContent=`最低日 ${salaryF.lowDate}`;if($('kpiOrdinary'))$('kpiOrdinary').textContent=yen(tot.ordinary);if($('kpiSpecialInv'))$('kpiSpecialInv').textContent=`${yen(tot.special)} / ${yen(tot.investment)}`;
  renderRules();renderImportSummary();
}
function renderRules(){$('rules').innerHTML=state.rules.map((r,i)=>`<div class="row"><div><b>${esc(r.name)}</b><div class="tiny">毎月${r.day}日 · ${esc(r.type||'fixed')}</div></div><div class="controls"><span class="amt ${r.amount<0?'bad':'good'}">${yen(r.amount)}</span><button class="btn secondary" onclick="editRule(${i})">編集</button><button class="btn secondary" onclick="delRule(${i})">削除</button></div></div>`).join('')||'<div class="muted">固定費ルールなし</div>'}
function renderImportSummary(){
  if(!$('importSummary'))return;const last=state.imports[0];$('importSummary').innerHTML=last?`最終取込: <b>${esc(last.source||last.kind||'')}</b> · ${last.added||0}件追加 · ${last.duplicates||0}件重複除外 · ${last.review||0}件要確認`:'まだ取込はありません。';
  $('reviewQueue').innerHTML=state.reviewQueue.slice(0,20).map((x,i)=>`<div class="row"><div><b>${esc(x.description||x.merchant||x.source||'要確認')}</b><div class="tiny">${esc(x.date||'')} · confidence ${Number(x.confidence||0).toFixed(2)}</div></div><button class="btn secondary" onclick="dismissReview(${i})">確認済み</button></div>`).join('');
}
window.dismissReview=i=>{state.reviewQueue.splice(i,1);save();render()};
window.delEvent=id=>{state.events=state.events.filter(e=>String(e.id)!==String(id));save();render()};
window.delRule=i=>{state.rules.splice(i,1);save();render()};
window.editRule=i=>{const r=state.rules[i],name=prompt('名称',r.name);if(!name)return;const day=+prompt('引落日',r.day),amount=+prompt('金額（支出はマイナス）',r.amount);if(!Number.isFinite(day)||!Number.isFinite(amount))return;Object.assign(r,{name,day,amount});save();render()};
$('addEvent').onclick=()=>{const date=prompt('日付 YYYY-MM-DD',today());if(!date)return;const name=prompt('内容','臨時支出');if(!name)return;const amount=+prompt('金額（支出はマイナス）','-10000');if(!Number.isFinite(amount))return;state.events.push({id:crypto.randomUUID(),date,name,amount,type:'OTHER_SPECIAL',ordinary_or_special:'SPECIAL'});save();render()};
$('addRule').onclick=()=>{const name=prompt('名称','固定費');if(!name)return;const day=+prompt('毎月何日','27'),amount=+prompt('金額（支出はマイナス）','-10000');if(!Number.isFinite(day)||!Number.isFinite(amount))return;state.rules.push({id:crypto.randomUUID(),name,day,amount,type:'OTHER_FIXED',ordinary_or_special:'ORDINARY',enabled:true});save();render()};
$('saveSettings').onclick=()=>{state.settings.cash=+$('cash').value||0;state.settings.reserve=+$('reserve').value||0;state.settings.salary=+$('salary').value||0;state.settings.salaryDay=+$('salaryDay').value||18;state.settings.reservedSpecial=+$('reservedSpecial')?.value||0;state.assets.bank=state.settings.cash;let r=state.rules.find(x=>x.id==='salary');if(state.settings.salary){if(!r){r={id:'salary',name:'給与',type:'INCOME_SALARY',ordinary_or_special:'ORDINARY',enabled:true};state.rules.push(r)}r.day=state.settings.salaryDay;r.amount=Math.abs(state.settings.salary)}save();render()};
$('snapshot').onclick=()=>{const month=ym(new Date()),a=state.assets,s={month,bank:a.bank||state.settings.cash,investment:a.investment||0,ideco:a.ideco||0,other:a.other||0,liabilities:a.liabilities||0};state.history=state.history.filter(x=>x.month!==month);state.history.push(s);state.history.sort((a,b)=>a.month.localeCompare(b.month));save();render()};

function parseCsv(text,separator=','){
  const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(x=>x.trim());return lines.map(line=>{let a=[],v='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){v+='"';i++}else q=!q}else if(c===separator&&!q){a.push(v);v=''}else v+=c}a.push(v);return a.map(x=>x.trim())});
}
function number(s){const t=String(s??'').replace(/[¥￥,\s]/g,'');return /^[-+]?\d+(\.\d+)?$/.test(t)?+t:null}
function parseDate(s){const t=String(s??'').trim();if(/^\d{8}$/.test(t))return `${t.slice(0,4)}-${t.slice(4,6)}-${t.slice(6,8)}`;if(/^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}$/.test(t)){const [y,m,d]=t.split(/[\/-]/);return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`};return t}
function rowObj(headers,row){const o={};headers.forEach((h,i)=>o[h]=row[i]??'');return o}
function findHeader(rows,needles){return rows.findIndex(r=>needles.every(n=>r.some(c=>String(c).includes(n))))}
async function fileHash(buf){const d=await crypto.subtle.digest('SHA-256',buf);return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('')}
function decode(buf,encoding){return new TextDecoder(encoding).decode(buf)}
function detectSource(file,buf){
  const name=file.name;let utf=decode(buf,'utf-8'),sjis='';try{sjis=decode(buf,'shift-jis')}catch{}
  const probes=[utf,sjis];
  if(/^RB-torihikimeisai.*\.csv$/i.test(name)||probes.some(t=>t.includes('取引日')&&t.includes('入出金(円)')&&t.includes('取引後残高(円)')))return{type:'bank_main',encoding:'shift-jis',text:sjis};
  if(name==='ゆうちょCSV.csv'||probes.some(t=>t.includes('入出金明細ＩＤ')&&t.includes('受入金額')))return{type:'bank_yucho',encoding:'shift-jis',text:sjis};
  if(/^enavi.*\.csv$/i.test(name)||utf.includes('利用店名・商品名'))return{type:'rakuten_card',encoding:'utf-8',text:utf};
  if(/^2026-2025\.csv$/i.test(name)||probes.some(t=>t.includes('確定情報')&&t.includes('ご利用金額')))return{type:'mufg_dc_jal_card',encoding:'shift-jis',text:sjis};
  if(/^Withdrawallist_.*\.csv$/i.test(name)||probes.some(t=>t.includes('入出金日')&&t.includes('入金額[円]')&&t.includes('出金額[円]')))return{type:'broker_cashflow',encoding:'shift-jis',text:sjis};
  if(/^assetbalance\(all\)_.*\.csv$/i.test(name))return{type:'broker_asset_snapshot',encoding:'shift-jis',text:sjis};
  if(/^tradehistory\(INVST\)_.*\.csv$/i.test(name))return{type:'broker_trade_mutual_fund',encoding:'shift-jis',text:sjis};
  if(/^tradehistory\(JP\)_.*\.csv$/i.test(name))return{type:'broker_trade_jp',encoding:'shift-jis',text:sjis};
  if(/^tradehistory\(US\)_.*\.csv$/i.test(name))return{type:'broker_trade_us',encoding:'shift-jis',text:sjis};
  return{type:'unknown',encoding:'utf-8',text:utf};
}
function classifyBank(desc,amount){
  const n=normalizeText(desc);let r={category:'UNKNOWN',ordinary_or_special:'ORDINARY',confidence:.4,is_transfer:false};
  if(amount>0&&n.includes('給与'))r={category:'INCOME_SALARY',ordinary_or_special:'ORDINARY',confidence:1,is_transfer:false};
  else if(n.includes(normalizeText('ラクテンカ－ト゛サ－ヒ゛ス')))r={category:'CARD_SETTLEMENT',ordinary_or_special:'DEBT',confidence:1,is_transfer:false};
  else if(n.includes(normalizeText('ミツヒ゛シＵＦＪニコス')))r={category:'DEBT_PRINCIPAL',ordinary_or_special:'DEBT',confidence:1,is_transfer:false};
  else if(n.includes(normalizeText('ＤＣカ－ト゛')))r={category:'CARD_SETTLEMENT',ordinary_or_special:'DEBT',confidence:1,is_transfer:false};
  else if(n.includes(normalizeText('シ゛エ－シ－ヒ゛－')))r={category:'CARD_SETTLEMENT',ordinary_or_special:'DEBT',confidence:1,is_transfer:false};
  else if(n.includes(normalizeText('コクミンネンキンキキンレンコ゛ウカイ')))r={category:'INVESTMENT_CONTRIBUTION',subcategory:'iDeCo',ordinary_or_special:'INVESTMENT',confidence:1,is_transfer:false};
  else if(n.includes(normalizeText('ラクテンショウケン')))r={category:'INTERNAL_TRANSFER',subcategory:'broker',ordinary_or_special:'TRANSFER',confidence:1,is_transfer:true};
  else if(n.includes(normalizeText('カ－ド出金'))||n.includes('ENET'))r={category:'CASH_WITHDRAWAL_UNCLASSIFIED',ordinary_or_special:'ORDINARY',confidence:.8,is_transfer:false};
  else if(amount>0&&n.includes(normalizeText('ニホンセイメイホケン')))r={category:'INCOME_INSURANCE',ordinary_or_special:'SPECIAL',confidence:.9,is_transfer:false};
  return r;
}
function classifyMerchant(merchant){
  const n=normalizeText(merchant),tests=[
    ['楽天キャッシュ','INVESTMENT_CONTRIBUTION','INVESTMENT',.95],['METLIFE','INSURANCE','ORDINARY',.95],['みんな電力','UTILITY_ELECTRICITY','ORDINARY',1],['ﾊﾁﾉﾍｴｷｶｶﾞｽ','UTILITY_GAS','ORDINARY',1],['ﾆﾎﾝｺｳｸｳ','TRAVEL','SPECIAL',1],['日本航空','TRAVEL','SPECIAL',1],['引越','MOVING_FURNITURE','SPECIAL',.95],['ｱ-ﾄﾋﾂｺｼ','MOVING_FURNITURE','SPECIAL',1],['ﾀｲﾔ','CAR_MAINTENANCE','SPECIAL',.9],['ｵｰﾄﾊﾞﾂｸｽ','CAR_MAINTENANCE','ORDINARY',.9],['ﾄﾖﾀｶﾛ','CAR_MAINTENANCE','ORDINARY',.9],['ｴﾈｵｽ','CAR_FUEL','ORDINARY',.9]
  ];
  for(const [p,c,o,conf] of tests)if(n.includes(normalizeText(p)))return{category:c,ordinary_or_special:o,confidence:conf};
  return{category:'UNKNOWN',ordinary_or_special:'ORDINARY',confidence:.4};
}
function bankKey(t){return [t.source,t.account||'',t.date,t.amount,normalizeText(t.description_raw),t.balance_after??''].join('|')}
function purchaseBaseKey(p){return[p.card,p.purchase_date,normalizeText(p.merchant_raw),p.original_amount].join('|')}
function addReview(item){if((item.confidence??1)<.7)state.reviewQueue.push({...item,id:crypto.randomUUID()})}
function upsertCash(items){let added=0,duplicates=0;const seen=new Set(state.cashTransactions.map(bankKey));for(const x of items){const k=bankKey(x);if(seen.has(k)){duplicates++;continue}seen.add(k);state.cashTransactions.push(x);addReview({source:x.source,date:x.date,description:x.description_raw,confidence:x.confidence});added++}return{added,duplicates}}
function upsertPurchases(items){let added=0,duplicates=0;const counts={};for(const p of state.purchaseEvents)counts[purchaseBaseKey(p)]=(counts[purchaseBaseKey(p)]||0)+1;for(const x of items){const base=purchaseBaseKey(x),same=state.purchaseEvents.filter(p=>purchaseBaseKey(p)===base);const exact=same.find(p=>p.source_file===x.source_file&&p.installment_number===x.installment_number&&p.billing_month===x.billing_month);if(exact){duplicates++;continue}x.occurrence_index=(counts[base]||0)+1;counts[base]=x.occurrence_index;state.purchaseEvents.push(x);addReview({source:x.card,date:x.purchase_date,merchant:x.merchant_raw,confidence:x.confidence});added++}return{added,duplicates}}

function parseBankMain(src,file){
  const rows=parseCsv(src.text),hi=findHeader(rows,['取引日','入出金(円)','取引後残高(円)']);if(hi<0)throw new Error('楽天銀行ヘッダーを認識できません。');const h=rows[hi],body=rows.slice(hi+1),items=[];
  for(const r of body){const o=rowObj(h,r),amount=number(o['入出金(円)']),bal=number(o['取引後残高(円)']);if(!o['取引日']||amount===null||bal===null)continue;const c=classifyBank(o['入出金内容'],amount);items.push({id:crypto.randomUUID(),source:'Rakuten Bank',source_file:file.name,account:'main',date:parseDate(o['取引日']),amount,balance_after:bal,description_raw:o['入出金内容'],cashflow_type:c.category,category:c.category,subcategory:c.subcategory||'',is_transfer:c.is_transfer,confidence:c.confidence,ordinary_or_special:c.ordinary_or_special})}
  for(let i=1;i<items.length;i++)if(items[i-1].balance_after+items[i].amount!==items[i].balance_after)throw new Error(`楽天銀行残高整合性エラー: ${items[i].date}`);
  const res=upsertCash(items),last=items.at(-1);if(last){state.settings.cash=last.balance_after;state.assets.bank=last.balance_after}return{...res,review:items.filter(x=>x.confidence<.7).length,source:'楽天銀行',latest:last?.date||'',balance:last?.balance_after};
}
function parseYucho(src,file){
  const rows=parseCsv(src.text),hi=findHeader(rows,['取引日','入出金明細ＩＤ']);if(hi<0)throw new Error('ゆうちょ明細ヘッダーを認識できません。');const h=rows[hi],items=[];for(const r of rows.slice(hi+1)){const o=rowObj(h,r),inAmt=number(o['受入金額（円）'])||0,outAmt=number(o['払出金額（円）'])||0;if(!o['取引日'])continue;const amount=inAmt-outAmt,desc=[o['詳細１'],o['詳細２']].filter(Boolean).join(' '),bal=number(o['現在（貸付）高']);const c=classifyBank(desc,amount);items.push({id:crypto.randomUUID(),source:'Yucho',source_file:file.name,account:'yucho',date:parseDate(o['取引日']),amount,balance_after:bal,description_raw:desc,cashflow_type:c.category,category:c.category,subcategory:c.subcategory||'',is_transfer:c.is_transfer,confidence:c.confidence,ordinary_or_special:c.ordinary_or_special})}const res=upsertCash(items);return{...res,review:items.filter(x=>x.confidence<.7).length,source:'ゆうちょ',latest:items.at(-1)?.date||''}}
function parseRakutenCard(src,file){
  const rows=parseCsv(src.text),hi=findHeader(rows,['利用日','利用店名・商品名']);if(hi<0)throw new Error('楽天カードヘッダーを認識できません。');
  const h=rows[hi],items=[],fileMatch=file.name.match(/enavi(\d{4})(\d{2})/i),billingMonth=fileMatch?`${fileMatch[1]}-${fileMatch[2]}`:'';
  const payHeader=h.find(x=>/^\d{1,2}月支払金額$/.test(String(x).trim()));let settlementTotal=0;
  for(const r of rows.slice(hi+1)){
    const o=rowObj(h,r);if(!o['利用日'])continue;const merchant=o['利用店名・商品名']||'',amount=number(o['利用金額']);if(amount===null)continue;
    const payment=o['支払方法']||'',refi=/ﾍﾝｻｲﾍﾝｺｳ|返済方法変更ＷＥＢ|分割変更/i.test(merchant+' '+payment),c=classifyMerchant(merchant),inst=(payment.match(/(\d+)回/)||[])[1];
    if(payHeader){const pv=number(o[payHeader]);if(pv!==null)settlementTotal+=pv}
    items.push({purchase_id:hash32(['Rakuten',o['利用日'],normalizeText(merchant),amount].join('|')),card:'Rakuten',source_file:file.name,purchase_date:parseDate(o['利用日']),merchant_raw:merchant,merchant_normalized:normalizeText(merchant),original_amount:Math.abs(amount),category:c.category,ordinary_or_special:c.ordinary_or_special,payment_method:payment,installment_count:inst?+inst:null,installment_number:null,is_refinanced:refi,billing_month:billingMonth||ym(parseDate(o['利用日'])),confidence:c.confidence,note:refi?'返済方法変更行。新規購入として集計しない。':''})
  }
  let added=0,duplicates=0,review=0;const withinFile={};
  for(const x of items.filter(x=>!x.is_refinanced)){
    const base=purchaseBaseKey(x),sameExisting=state.purchaseEvents.filter(p=>purchaseBaseKey(p)===base),isInstallment=/分割|リボ|回/.test(x.payment_method||'');
    if(isInstallment&&sameExisting.length){duplicates++;continue}
    const idx=(withinFile[base]||0)+1;withinFile[base]=idx;
    const exact=sameExisting.find(p=>p.source_file===x.source_file&&Number(p.occurrence_index||1)===idx);if(exact){duplicates++;continue}
    x.occurrence_index=idx;state.purchaseEvents.push(x);if(x.confidence<.7){addReview({source:x.card,date:x.purchase_date,merchant:x.merchant_raw,confidence:x.confidence});review++}added++;
  }
  if(billingMonth&&payHeader&&settlementTotal){
    const [y,m]=billingMonth.split('-').map(Number),due=ruleDate(y,m,27),sid=`rakuten:${billingMonth}`;
    const rec={settlement_id:sid,card:'Rakuten',due_date:due,amount:Math.abs(settlementTotal),principal:null,fee_interest:null,remaining_balance:null,source_file:file.name,confidence:.95};
    const old=state.cardSettlements.find(x=>x.settlement_id===sid);if(old)Object.assign(old,rec);else state.cardSettlements.push(rec);
  }
  return{added,duplicates,review,source:'楽天カード',latest:items.map(x=>x.purchase_date).sort().at(-1)||''}
}
function parseMufg(src,file){
  const rows=parseCsv(src.text),hi=findHeader(rows,['確定情報','ご利用日','ご利用金額（円）']);if(hi<0)throw new Error('MUFG/DC/JALカードヘッダーを認識できません。');const h=rows[hi],raw=[],exact=new Set();for(const r of rows.slice(hi+1)){const o=rowObj(h,r);if(o['確定情報']!=='確定'||!o['ご利用日']||!o['ご利用店名（海外ご利用店名／海外都市名）'])continue;const amount=number(o['ご利用金額（円）']);if(amount===null)continue;const key=JSON.stringify(r);if(exact.has(key))continue;exact.add(key);const merchant=o['ご利用店名（海外ご利用店名／海外都市名）'],c=classifyMerchant(merchant);raw.push({purchase_id:hash32(['MUFG/DC/JAL',o['ご利用日'],normalizeText(merchant),amount].join('|')),card:'MUFG/DC/JAL',source_file:file.name,purchase_date:parseDate(o['ご利用日']),merchant_raw:merchant,merchant_normalized:normalizeText(merchant),original_amount:Math.abs(amount),category:c.category,ordinary_or_special:c.ordinary_or_special,payment_method:`${o['支払回数']||''} ${o['何回目']||''}`.trim(),installment_count:number(o['支払回数']),installment_number:number(o['何回目']),billing_month:parseDate(o['お支払日']).slice(0,7),confidence:c.confidence})}const res=upsertPurchases(raw);return{...res,review:raw.filter(x=>x.confidence<.7).length,source:'MUFG/DC/JAL',latest:raw.map(x=>x.purchase_date).sort().at(-1)||''}}
function parseBrokerCash(src,file){
  const rows=parseCsv(src.text),hi=findHeader(rows,['入出金日','入金額[円]','出金額[円]']);if(hi<0)throw new Error('楽天証券入出金ヘッダーを認識できません。');const h=rows[hi],items=[];for(const r of rows.slice(hi+1)){const o=rowObj(h,r);if(!o['入出金日'])continue;const amount=(number(o['入金額[円]'])||0)-(number(o['出金額[円]'])||0);items.push({id:crypto.randomUUID(),source:'Rakuten Securities',source_file:file.name,account:'broker',date:parseDate(o['入出金日']),amount,balance_after:null,description_raw:[o['内容'],o['出金先']].filter(Boolean).join(' '),cashflow_type:'INTERNAL_TRANSFER',category:'INTERNAL_TRANSFER',is_transfer:true,confidence:1,ordinary_or_special:'TRANSFER'})}const res=upsertCash(items);return{...res,review:0,source:'楽天証券 入出金',latest:items.at(-1)?.date||''}}
function parseAssetSnapshot(src,file){const text=src.text,find=label=>{const line=text.split(/\r?\n/).find(x=>x.includes(label));if(!line)return null;const nums=(line.match(/[-+]?\d[\d,]*/g)||[]).map(x=>number(x)).filter(x=>x!==null);return nums.at(-1)??null};const total=find('資産合計'),cash=find('預り金合計'),snap={snapshot_date:today(),institution:'Rakuten Securities',asset_type:'ALL',market_value:total,cash_balance:cash,source_file:file.name};state.assetSnapshots.push(snap);if(total!==null)state.assets.investment=total;return{added:1,duplicates:0,review:0,source:'楽天証券 資産残高',latest:today()}}
function parseTrade(src,file,type){const rows=parseCsv(src.text),hi=rows.findIndex(r=>r.some(c=>/約定日|受渡日|取引日/.test(c)));if(hi<0)throw new Error('楽天証券取引履歴ヘッダーを認識できません。');const h=rows[hi],items=[];for(const r of rows.slice(hi+1)){const o=rowObj(h,r),date=parseDate(o['約定日']||o['受渡日']||o['取引日']);if(!date)continue;const name=o['銘柄名']||o['ファンド名']||o['商品名']||'',side=o['売買']||o['取引区分']||'',amount=number(o['受渡金額']||o['約定金額']||o['金額']);items.push({investment_id:crypto.randomUUID(),date,broker:'Rakuten Securities',asset_type:type,security_name:name,side,amount:amount??0,quantity:number(o['数量']||o['口数']),account_type:o['口座']||'',source_file:file.name})}const existing=new Set(state.investmentEvents.map(x=>[x.date,x.asset_type,x.security_name,x.side,x.amount,x.quantity].join('|')));let added=0,duplicates=0;for(const x of items){const k=[x.date,x.asset_type,x.security_name,x.side,x.amount,x.quantity].join('|');if(existing.has(k)){duplicates++;continue}existing.add(k);state.investmentEvents.push(x);added++}return{added,duplicates,review:0,source:`楽天証券 取引履歴 ${type}`,latest:items.map(x=>x.date).sort().at(-1)||''}}

async function importOne(file){
  const buf=await file.arrayBuffer(),sha=await fileHash(buf);if(state.imports.some(x=>x.sha256===sha))return{source:'重複ファイル',added:0,duplicates:1,review:0,skipped:true};
  const src=detectSource(file,buf);let result;
  if(src.type==='bank_main')result=parseBankMain(src,file);else if(src.type==='bank_yucho')result=parseYucho(src,file);else if(src.type==='rakuten_card')result=parseRakutenCard(src,file);else if(src.type==='mufg_dc_jal_card')result=parseMufg(src,file);else if(src.type==='broker_cashflow')result=parseBrokerCash(src,file);else if(src.type==='broker_asset_snapshot')result=parseAssetSnapshot(src,file);else if(src.type==='broker_trade_mutual_fund')result=parseTrade(src,file,'MUTUAL_FUND');else if(src.type==='broker_trade_jp')result=parseTrade(src,file,'JP_STOCK');else if(src.type==='broker_trade_us')result=parseTrade(src,file,'US_STOCK');else throw new Error('未対応CSVです。既知ヘッダーと一致しないため自動推測はしません。');
  state.imports.unshift({at:new Date().toISOString(),file:file.name,sha256:sha,type:src.type,...result});save();return result;
}
async function readCsv(files){
  for(const file of [...files]){const div=document.createElement('div');div.className='card';div.style.marginTop='10px';div.innerHTML=`<div class="title">${esc(file.name)}</div><div class="muted">解析中...</div>`;$('importResults').prepend(div);try{const r=await importOne(file);div.innerHTML=`<div class="title">${esc(file.name)} <span class="tag">${esc(r.source)}</span></div><div class="row"><span>追加</span><b>${r.added||0}件</b></div><div class="row"><span>重複除外</span><b>${r.duplicates||0}件</b></div><div class="row"><span>要確認</span><b>${r.review||0}件</b></div>${r.balance!==undefined?`<div class="row"><span>最新残高</span><b>${yen(r.balance)}</b></div>`:''}`;render()}catch(e){div.innerHTML=`<div class="title bad">${esc(file.name)} · 取込停止</div><div class="note">${esc(e.message)}</div>`}}
}

function importRuleSpec(obj){
  if(!obj||!obj.core_principles||!obj.forecast_defaults)return false;
  state.importRules=obj;const d=obj.forecast_defaults||{};
  state.settings.reserve=Number(d.safety_floor_initial)||state.settings.reserve;
  state.settings.salary=Number(d.monthly_salary_net)||state.settings.salary;state.settings.salaryDay=18;
  const defs=[
    ['salary','給与',18,Math.abs(Number(d.monthly_salary_net)||0),'INCOME_SALARY','ORDINARY'],
    ['wife-standard','妻 通常生活費',18,-Math.abs(Number(d.wife_standard_household)||0),'HOUSEHOLD_STANDARD','ORDINARY'],
    ['wife-card','妻 カード補填',19,-Math.abs(Number(d.wife_card_support_baseline)||0),'HOUSEHOLD_EXTRA','ORDINARY'],
    ['car-loan','車ローン',19,-Math.abs(Number(d.car_loan_monthly)||0),'CAR_LOAN','DEBT'],
    ['other-fixed','別固定支払',19,-Math.abs(Number(d.other_fixed_monthly)||0),'OTHER_FIXED','ORDINARY'],
    ['ideco','iDeCo',26,-Math.abs(Number(d.ideco_monthly)||0),'INVESTMENT_CONTRIBUTION','INVESTMENT'],
    ['water','水道',25,-Math.abs(Number(d.water_monthly)||0),'UTILITY_WATER','ORDINARY']
  ];
  for(const [id,name,day,amount,type,ord] of defs){if(!amount)continue;const old=state.rules.find(x=>x.id===id);const rec={id,name,day,amount,type,ordinary_or_special:ord,enabled:true};if(old)Object.assign(old,rec);else state.rules.push(rec)}
  for(const e of obj.known_future_events||[]){const id=`spec:${e.date}:${hash32(e.label)}`;const rec={id,date:e.date,name:e.label,amount:Number(e.amount)||0,type:e.type||(e.principal?'DEBT_PRINCIPAL':'OTHER_SPECIAL'),ordinary_or_special:e.type?.startsWith('INCOME_')?'SPECIAL':'DEBT',principal:e.principal,fee_interest:e.fee,remaining_balance:e.post_payment_balance,estimated:!!e.estimated};const old=state.events.find(x=>x.id===id);if(old)Object.assign(old,rec);else state.events.push(rec);if(e.post_payment_balance!==undefined)state.assets.revolvingBalance=Number(e.post_payment_balance)||state.assets.revolvingBalance}
  save();render();return true;
}

$('drop').onclick=()=>$('csvInput').click();$('csvInput').onchange=e=>readCsv(e.target.files);$('drop').ondragover=e=>e.preventDefault();$('drop').ondrop=e=>{e.preventDefault();readCsv(e.dataTransfer.files)};
$('exportJson').onclick=()=>{const b=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='household-treasury-backup.json';a.click();URL.revokeObjectURL(a.href)};
$('importJson').onclick=()=>$('jsonInput').click();$('jsonInput').onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const obj=JSON.parse(r.result);if(!importRuleSpec(obj)){state=obj;normalize();save();render()}}catch{alert('JSONを読み込めませんでした')}};r.readAsText(f)};
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));b.classList.add('active');$(b.dataset.page).classList.add('active');render()});
window.getTreasuryState=()=>structuredClone(state);window.replaceTreasuryState=n=>{state=structuredClone(n);normalize();localStorage.setItem(KEY,JSON.stringify(state));injectUi();render()};window.setTreasurySaveStatus=t=>$('saveStatus').textContent=t;
load();render();
