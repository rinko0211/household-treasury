/* v213: Lightweight, user-editable generic expense CSV. Never pretend to be a bank/card statement. */
(()=>{
'use strict';
if(window.householdSimpleExpenseImportV213)return;
const CATEGORIES=['UTILITIES','COMMUNICATION','FOOD','DAILY_GOODS','CHILD','MEDICAL','CAR','TRANSPORT','ENTERTAINMENT','INSURANCE','SUBSCRIPTION','PERSONAL','OTHER'];
const CATS={'公共料金':'UTILITIES','ガス':'UTILITIES','電気':'UTILITIES','水道':'UTILITIES','通信':'COMMUNICATION','食費':'FOOD','食品':'FOOD','日用品':'DAILY_GOODS','子ども':'CHILD','子ども用品':'CHILD','医療':'MEDICAL','車':'CAR','交通':'TRANSPORT','娯楽':'ENTERTAINMENT','保険':'INSURANCE','サブスク':'SUBSCRIPTION','個人費':'PERSONAL','その他':'OTHER'};
const LABELS={UTILITIES:'公共料金',COMMUNICATION:'通信',FOOD:'食費',DAILY_GOODS:'日用品',CHILD:'子ども',MEDICAL:'医療',CAR:'車',TRANSPORT:'交通',ENTERTAINMENT:'娯楽',INSURANCE:'保険',SUBSCRIPTION:'サブスク',PERSONAL:'個人費',OTHER:'その他'};
const NATURES={FIXED:'固定費',VARIABLE:'変動費',PERSONAL:'個人費',SPECIAL:'特別費'};
const n=x=>String(x??'').normalize('NFKC').trim();
const norm=x=>n(x).replace(/[\s　・()（）_\/／.,，。\-ー]/g,'').toUpperCase();
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const int=x=>{const a=n(x).replace(/[,，¥￥]/g,'');return /^[0-9]+$/.test(a)&&Number.isSafeInteger(Number(a))?Number(a):NaN;};
const day=x=>/^\d{4}-\d\d-\d\d$/.test(x)&&!Number.isNaN(Date.parse(x+'T00:00:00Z'));
const dayDiff=(a,b)=>Math.abs(Date.parse(a+'T00:00:00Z')-Date.parse(b+'T00:00:00Z'))/86400000;
const amount=x=>Math.abs(Number(x)||0);
const hash=s=>{let h=2166136261;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return(h>>>0).toString(16)};
const stateNow=()=> (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{};
const parseCells=raw=>{
 const rows=[],src=String(raw||'').replace(/^\uFEFF/,''),L=src.length;let v='',line=[],quote=false;
 for(let i=0;i<L;i++){
  const ch=src[i];
  if(ch==='"'){if(quote&&src[i+1]==='"'){v+='"';i++}else quote=!quote}
  else if(ch===','&&!quote){line.push(v.trim());v=''}
  else if((ch==='\n'||ch==='\r')&&!quote){if(ch==='\r'&&src[i+1]==='\n')i++;line.push(v.trim());if(line.some(Boolean))rows.push(line);line=[];v=''}
  else v+=ch;
 }
 if(quote)throw Error('CSVの引用符が閉じていません。');
 line.push(v.trim());if(line.some(Boolean))rows.push(line);
 return rows;
};
function parse(text){
 const lines=parseCells(text);if(!lines.length)return null;
 const head=lines[0].map(n);
 if(head.includes('利用店名・商品名')||head.includes('利用金額'))return null;
 if(!['利用日','店舗','金額'].every(k=>head.includes(k)))return null;
 if(lines.length>81)throw Error('簡易CSVは一度に80件まで読み込めます。');
 const h=Object.fromEntries(head.map((v,i)=>[v,i]));
 const get=(cells,key)=>cells[h[key]]??'';
 const seen=new Set();
 return lines.slice(1).map((cells,i)=>{
  const date=n(get(cells,'利用日')),merchant=n(get(cells,'店舗')),value=int(get(cells,'金額'));
  if(!day(date)||!merchant||merchant.length>250||!(value>0))throw Error((i+2)+'行目の利用日・店舗・金額が不正です。');
  const category=CATS[n(get(cells,'カテゴリ'))]||CATEGORIES.find(c=>c===n(get(cells,'カテゴリ')).toUpperCase())||'OTHER';
  const nature=String(get(cells,'費目')||get(cells,'区分')||'').trim();
  let bucket=/固定/.test(nature)?'FIXED':/個人/.test(nature)?'PERSONAL':/特別/.test(nature)?'SPECIAL':'VARIABLE';
  if(category==='UTILITIES'&&!nature)bucket='FIXED';
  const method=n(get(cells,'支払方法'));
  const pay=/^現金$|^CASH$/i.test(method)?'CASH':/カード|^CARD$|RAKUTEN|JAL|Dカード|QUICPAY/i.test(method)?'CARD':'UNCONFIRMED';
  const card=n(get(cells,'カード'))|| (method.includes('楽天')?'Rakuten':'');
  const note=n(get(cells,'備考'))||n(get(cells,'内容'));
  const key='simple-v213:'+hash([date,norm(merchant),value,Math.min(99,i)].join('|'));
  if(seen.has(key))throw Error('同一CSVの識別子が重複しています。');
  seen.add(key);
  return {date,merchant,amount:value,category,bucket,payment:pay,card,description:n(get(cells,'内容')),note,key,include:true};
 });
}
const counted=x=>x?.count_in_spending!==false&&x?.reconciliation_status!=='ABSORBED_DUPLICATE'&&!x?.manually_deleted_v192&&!x?.is_refinanced;
function index(st){
 const byKey=new Set(),possible=[];
 const collect=(r,kind)=>{
  const k=String(r.dedup_key||r.simple_expense_key_v213||'');if(k)byKey.add(k);
  if(!counted(r))return;
  const date=kind==='cash'?r.date:r.purchase_date;
  const label=kind==='cash'?(r.description||r.description_raw):r.merchant_raw;
  const money=amount(kind==='cash'?r.amount:r.original_amount);
  if(day(String(date))&&money>0)possible.push({date,label:norm(label),amount:money,kind});
 };
 for(const r of st.cashExpenses||[])collect(r,'cash');
 for(const r of st.purchaseEvents||[])collect(r,'purchase');
 return {byKey,possible};
}
function hint(row,idx){
 if(idx.byKey.has(row.key))return {exact:true,label:'取込済みの簡易CSV'};
 let best=null;
 for(const x of idx.possible){
  const distance=dayDiff(row.date,x.date);
  if(distance>2)continue;
  const diff=Math.abs(row.amount-x.amount);
  const similar=norm(row.merchant).length>=3&&x.label.length>=3&&
    (norm(row.merchant).includes(x.label)||x.label.includes(norm(row.merchant)));
  if((similar&&diff<=Math.max(150,row.amount*.05))||
    (distance===0&&diff===0)){
   best={exact:false,label:'既存支出の照合候補：'+x.date+' / '+x.amount+'円 / '+x.kind};
   break;
  }
 }
 return best;
}
function validate(row){
 const r={...row,date:n(row.date),merchant:n(row.merchant),amount:int(row.amount),card:n(row.card)};
 if(!day(r.date)||!r.merchant||r.merchant.length>250||!Number.isSafeInteger(r.amount)||r.amount<=0)throw Error('利用日・店舗・金額を確認してください。');
 if(!CATEGORIES.includes(r.category))throw Error('カテゴリを選択してください。');
 if(!Object.hasOwn(NATURES,r.bucket))throw Error('固定費・変動費・個人費・特別費を選択してください。');
 if(!['CASH','CARD','UNCONFIRMED'].includes(r.payment))throw Error('支払方法を選択してください。');
 if(r.payment==='CARD'&&!r.card)throw Error('カード払いを選んだ場合はカード名を入力してください。カード不明なら「未確認」にしてください。');
 if(r.card.length>100)throw Error('カード名が長すぎます。');
 return r;
}
function plan(st,rows,sourceName='simple-expense.csv'){
 const i=index(st),out=[],warnings=[],seen=new Set(),now=new Date().toISOString();let duplicates=0;
 for(const original of rows){
  if(!original.include)continue;
  const r=validate(original);
  if(seen.has(r.key))throw Error('CSV内で同じレコードが選択されています。');seen.add(r.key);
  const overlap=hint(r,i);
  if(overlap?.exact){duplicates++;continue}
  if(overlap&&!r.force){warnings.push(r.merchant+'：'+overlap.label);continue}
  const base={record_kind:'RECEIPT_PURCHASE',economic_type:'EXPENSE',
    category:r.category,subcategory:r.category==='UTILITIES'&&/ガス/.test(r.merchant+r.description)?'GAS':'OTHER',
    spending_class:r.bucket==='SPECIAL'?'SPECIAL':'NORMAL',
    ordinary_or_special:r.bucket==='SPECIAL'?'SPECIAL':'ORDINARY',
    expense_scope:r.bucket==='SPECIAL'?'SPECIAL':'NORMAL',
    cost_nature:r.bucket==='SPECIAL'?'VARIABLE':r.bucket,
    expense_bucket_v193:r.bucket==='SPECIAL'?'VARIABLE':r.bucket,
    payment_method:r.payment==='CARD'?'CARD':r.payment,
    dedup_key:r.key,simple_expense_key_v213:r.key,
    simple_expense_manual_v213:true,source_file:sourceName,
    receipt_reconciliation_pending:r.payment!=='CASH',
    note:r.note||r.description,count_in_spending:true,imported_at:now};
  if(r.bucket==='PERSONAL')base.personal_owner_v193=['wife','self'].includes(r.owner)?r.owner:'';
  if(r.payment==='CARD'){
   out.push({kind:'purchase',data:{...base,purchase_id:'simple-card:'+r.key,
    purchase_date:r.date,merchant_raw:r.merchant,merchant_normalized:norm(r.merchant),
    original_amount:r.amount,payment_amount:r.amount,purchase_total:r.amount,
    payment_route:'CARD',card:r.card,settlement_pending:true,
    expected_settlement_status:'UNCONFIRMED',confidence:1}});
  }else{
   out.push({kind:'cash',data:{...base,id:'simple-cash:'+r.key,date:r.date,
    description:r.merchant,amount:r.amount,card:r.payment==='UNCONFIRMED'?null:r.card}});
  }
  i.byKey.add(r.key);
  i.possible.push({date:r.date,label:norm(r.merchant),amount:r.amount});
 }
 return {out,warnings,duplicates,added:out.length,total:out.reduce((sum,x)=>sum+amount(x.data.amount??x.data.original_amount),0)};
}
function apply(rows,sourceName){
 const raw=stateNow(),checked=plan(raw,rows,sourceName);
 if(checked.warnings.length)throw Error('重複の可能性がある取引があります。該当行のチェックを外すか「別の支出として登録」を指定してください。');
 if(!checked.added)return {...checked,skipped:true};
 if(!window.confirm?.('簡易支出 '+checked.added+'件、'+checked.total.toLocaleString('ja-JP')+'円を登録します。カード請求・引落は新規作成しません。よろしいですか？'))return {...checked,cancelled:true};
 const fresh=plan(stateNow(),rows,sourceName);
 if(fresh.warnings.length||fresh.total!==checked.total||fresh.added!==checked.added)throw Error('登録中に支出が変更されました。再度確認してください。');
 if(typeof window.replaceTreasuryState!=='function'||typeof window.treasuryRecoverySnapshot!=='function')throw Error('安全な保存機能が利用できません。');
 const next=structuredClone(stateNow());
 next.cashExpenses=Array.isArray(next.cashExpenses)?next.cashExpenses:[];
 next.purchaseEvents=Array.isArray(next.purchaseEvents)?next.purchaseEvents:[];
 for(const v of fresh.out)(v.kind==='cash'?next.cashExpenses:next.purchaseEvents).push(v.data);
 window.treasuryRecoverySnapshot('簡易支出CSVの登録前');
 if(window.replaceTreasuryState(next)===false)throw Error('登録を保存できませんでした。');
 window.cloudSyncOnLocalSave?.();
 window.dispatchEvent?.(new CustomEvent('treasury:expenses-imported',{detail:{source:'SIMPLE_EXPENSE_V213'}}));
 return fresh;
}
// v220: CSV is one-step import. Editing is exclusively on the 支出 page.
let host=null;
function displayName(value){
 const name=String(value||'').split(/[\\/]/).at(-1);
 try{return /%[0-9a-f]{2}/i.test(name)?decodeURIComponent(name):name}catch{return name}
}
function showResult(result,name){
 const target=host?.querySelector('#simpleExpenseResultV220');
 if(!target)return;
 const imported=Number(result.added)||0;
 const exact=Number(result.duplicates)||0;
 const pending=Array.isArray(result.withheld)?result.withheld:[];
 const title=result.cancelled?'登録をキャンセルしました。':
  imported?imported+'件の支出を登録しました。':'新たな登録はありません。';
 const stats=['取込対象 '+Number(result.read||0)+'件'];
 if(exact)stats.push('登録済み '+exact+'件');
 if(pending.length)stats.push('重複確認待ち '+pending.length+'件');
 if(result.adjusted)stats.push('カード不明 '+result.adjusted+'件は支払方法未確認で登録');
 const list=pending.length?
  '<p class="tiny" style="margin:6px 0 0">重複の疑いがある行は登録を保留しました：'+
  pending.slice(0,3).map(x=>esc(x.merchant)+' '+x.amount.toLocaleString('ja-JP')+'円').join('、')+
  (pending.length>3?' ほか'+(pending.length-3)+'件':'')+
  '。必要なら元CSVを確認してください。</p>':'';
 target.innerHTML='<p class="tiny" style="margin:8px 0 3px;overflow-wrap:anywhere">'+
  '<strong>'+esc(title)+'</strong> '+esc(stats.join(' ／ '))+'</p>'+
  '<p class="tiny" style="margin:0;overflow-wrap:anywhere">'+esc(displayName(name))+
  '。明細の修正・削除・分類は「支出」ページで行えます。</p>'+list;
}
async function importDirect(file){
 if(!file)return {cancelled:true,read:0,added:0,duplicates:0,withheld:[]};
 let csv=await file.text();
 if(csv.includes('\uFFFD')&&typeof TextDecoder==='function'){
  try{csv=new TextDecoder('shift-jis').decode(await file.arrayBuffer())}catch{}
 }
 const rows=parse(csv);
 if(!rows)throw Error('簡易支出CSVのヘッダーではありません。「利用日,店舗,金額」が必要です。');
 if(!rows.length)throw Error('CSVに支出がありません。');
 const idx=index(stateNow()),ready=[],withheld=[];
 let duplicates=0,adjusted=0;
 for(const original of rows){
  const row={...original};
  // Preserve user spending without inventing a specific card.
  if(row.payment==='CARD'&&!row.card){row.payment='UNCONFIRMED';adjusted++;}
  validate(row);
  const overlap=hint(row,idx);
  if(overlap?.exact){duplicates++;continue;}
  if(overlap){withheld.push(row);continue;}
  ready.push(row);
  // Detect repeated rows in the same file before they reach the ledger.
  idx.byKey.add(row.key);
  idx.possible.push({date:row.date,label:norm(row.merchant),amount:row.amount});
 }
 const done=ready.length?apply(ready,file.name):{added:0,skipped:true};
 return {source:'簡易支出CSV（直接登録・支出で編集）',
  read:rows.length,added:done.cancelled?0:done.added||0,
  duplicates:duplicates+(done.duplicates||0),
  review:withheld.length,withheld,adjusted,
  cancelled:!!done.cancelled,skipped:!!done.skipped};
}
function exportTemplate(){
 const csv='\uFEFF利用日,店舗,金額,内容,カテゴリ,費目,支払方法,カード,備考\n'+
  '2026-11-01,八戸液化ガス,4769,11月分ガス代,公共料金,固定費,未確認,,請求月は未確定\n';
 const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='簡易支出_取込用テンプレート.csv';a.click();
 setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function mount(){
 const parent=document.querySelector('#imports .grid');
 if(!parent)return;
 const existing=parent.querySelector('#simpleExpenseImportV213');
 if(existing){host=existing;return;}
 host=document.createElement('div');host.id='simpleExpenseImportV213';host.className='card full';
 host.innerHTML='<div class="title">簡易支出CSV</div>'+
  '<p class="tiny" style="overflow-wrap:anywhere">CSVを選び、件数と金額を一度確認するだけで登録します。'+
  '登録後の修正は「支出」ページで行えます。重複候補は安全のため保留します。</p>'+
  '<div class="controls"><label class="btn secondary" for="simpleExpenseFileV213">CSVを選ぶ</label>'+
  '<input type="file" id="simpleExpenseFileV213" class="hidden" accept=".csv,text/csv">'+
  '<button type="button" class="btn secondary" id="simpleExpenseTemplateV213">ひな型CSV</button></div>'+
  '<div id="simpleExpenseResultV220" role="status" aria-live="polite"></div>';
 parent.insertBefore(host,parent.firstChild);
 host.querySelector('#simpleExpenseTemplateV213').addEventListener('click',exportTemplate);
 host.querySelector('#simpleExpenseFileV213').addEventListener('change',async e=>{
  const input=e.target;
  try{
   const file=input.files?.[0];if(!file)return;
   const out=await importDirect(file);
   showResult(out,file.name);
  }catch(err){
   host.querySelector('#simpleExpenseResultV220').textContent='登録停止：'+String(err?.message||err);
  }finally{input.value='';}
 });
}
// The main Import picker uses the same one-step path; do not show a second editor.
function install(){
 if(typeof importOne!=='function')return false;
 if(importOne.__simpleExpenseV213)return true;
 const prior=importOne;
 importOne=async function(file){
  if(!/\.csv$/i.test(String(file?.name||'')))return prior(file);
  let csv=await file.text();
  if(csv.includes('\uFFFD')&&typeof TextDecoder==='function'){
   try{csv=new TextDecoder('shift-jis').decode(await file.arrayBuffer())}catch{}
  }
  if(!parse(csv))return prior(file);
  mount();
  const result=await importDirect(file);
  showResult(result,file.name);
  return {source:result.source,read:result.read,added:result.added,
   duplicates:result.duplicates,review:result.review,skipped:!!result.cancelled||!!result.skipped};
 };
 importOne.__simpleExpenseV213=true;
 return true;
}
window.householdSimpleExpenseImportV213={parse,index,hint,plan,apply,importDirect,mount,install,validate};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else setTimeout(mount,0);
if(!install())window.setTimeout?.(install,0);
})();