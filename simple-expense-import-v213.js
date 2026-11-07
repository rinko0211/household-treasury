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
const CAT_OPTIONS=CATEGORIES.map(c=>'<option value="'+c+'">'+LABELS[c]+'</option>').join('');
const BUCKET_OPTIONS=Object.entries(NATURES).map(([k,v])=>'<option value="'+k+'">'+v+'</option>').join('');
const PAY_OPTIONS='<option value="UNCONFIRMED">未確認</option><option value="CASH">現金</option><option value="CARD">カード（後で変更可）</option>';
let current=[],sourceFile='',host=null;
function controls(r,i){
 const options=(html,val)=>html.replace('value="'+esc(val)+'"','value="'+esc(val)+'" selected');
 const field=(name,type,value)=>'<label style="display:block;min-width:0"><span style="font-size:12px">'+name+'</span><input style="width:100%" type="'+type+'" data-simple-i="'+i+'" data-simple-field="'+({日付:'date',店舗:'merchant',金額:'amount',カード名:'card'}[name])+'" value="'+esc(value)+'"></label>';
 return '<div style="padding:12px;margin:9px 0;border:1px solid #536674;border-radius:10px">'+
  '<label><input type="checkbox" data-simple-i="'+i+'" data-simple-field="include" checked> '+(i+1)+'件目を登録する</label>'+
  '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">'+field('日付','date',r.date)+field('金額','number',r.amount)+'</div>'+
  field('店舗','text',r.merchant)+
  '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">'+
  '<label>費目<select style="width:100%" data-simple-i="'+i+'" data-simple-field="bucket">'+options(BUCKET_OPTIONS,r.bucket)+'</select></label>'+
  '<label>カテゴリ<select style="width:100%" data-simple-i="'+i+'" data-simple-field="category">'+options(CAT_OPTIONS,r.category)+'</select></label>'+
  '<label>支払方法<select style="width:100%" data-simple-i="'+i+'" data-simple-field="payment">'+options(PAY_OPTIONS,r.payment)+'</select></label>'+
  field('カード名','text',r.card)+'</div>'+
  '<label>備考<input style="width:100%" data-simple-i="'+i+'" data-simple-field="note" value="'+esc(r.note)+'"></label>'+
  '<label style="font-size:12px"><input type="checkbox" data-simple-i="'+i+'" data-simple-field="force"> 既存候補と別の支出であると確認した</label></div>';
}
function renderPreview(){
 if(!host)return;
 const view=host.querySelector('#simpleExpensePreviewV213');if(!view)return;
 const idx=index(stateNow());
 const notices=current.map((r,i)=>{const x=hint(r,idx);return x&&!x.exact?'【'+(i+1)+'件目】'+x.label:x?.exact?'【'+(i+1)+'件目】取込済みの可能性':''}).filter(Boolean);
 view.innerHTML='<p class="tiny">'+esc(sourceFile)+' / '+current.length+'件。編集内容は「登録する」まで家計に反映されません。</p>'+
  (notices.length?'<div class="note">'+notices.map(x=>esc(x)).join('<div></div>')+'</div>':'')+
  current.map(controls).join('')+
  '<button class="btn" type="button" id="simpleExpenseSaveV213">確認して登録</button> '+
  '<button class="btn secondary" type="button" id="simpleExpenseDiscardV213">キャンセル</button>'+
  '<div class="tiny" id="simpleExpenseStatusV213"></div>';
}
async function fileSelected(file){
 if(!file)return;
 let text=await file.text(),rows;
 if(text.includes('\uFFFD')&&typeof TextDecoder==='function'){
  try{text=new TextDecoder('shift-jis').decode(await file.arrayBuffer())}catch{}
 }
 rows=parse(text);
 if(!rows)throw Error('簡易支出CSVのヘッダーではありません。「利用日,店舗,金額」の列が必要です。');
 if(!rows.length)throw Error('CSVに支出がありません。');
 current=rows;sourceFile=file.name;renderPreview();
}
function exportTemplate(){
 const csv='\uFEFF利用日,店舗,金額,内容,カテゴリ,費目,支払方法,カード,備考\n'+
  '2026-11-01,八戸液化ガス,4769,11月分ガス代,公共料金,固定費,未確認,,請求月は未確定\n';
 const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='簡易支出_編集用テンプレート.csv';a.click();
 setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function mount(){
 const parent=document.querySelector('#imports .grid');if(!parent||parent.querySelector('#simpleExpenseImportV213'))return;
 host=document.createElement('div');host.id='simpleExpenseImportV213';host.className='card full';
 host.innerHTML='<div class="title">簡易支出CSV（取込前に修正）</div>'+
  '<p class="tiny">銀行・カード会社の正式CSVでなくても登録できます。日付・金額・固定費/変動費・カードを画面で編集できます。カード請求は作成しません。</p>'+
  '<div class="controls"><label class="btn secondary" for="simpleExpenseFileV213">CSVを選ぶ</label>'+
  '<input type="file" id="simpleExpenseFileV213" class="hidden" accept=".csv,text/csv">'+
  '<button type="button" class="btn secondary" id="simpleExpenseTemplateV213">ひな型CSV</button></div>'+
  '<div id="simpleExpensePreviewV213"></div>';
 parent.insertBefore(host,parent.firstChild);
 host.querySelector('#simpleExpenseTemplateV213').addEventListener('click',exportTemplate);
 host.querySelector('#simpleExpenseFileV213').addEventListener('change',async e=>{
  try{await fileSelected(e.target.files?.[0])}
  catch(err){host.querySelector('#simpleExpensePreviewV213').textContent=String(err?.message||err)}
  finally{e.target.value=''}
 });
 host.addEventListener('input',e=>{
  const el=e.target;if(!el?.dataset?.simpleField)return;
  const i=Number(el.dataset.simpleI),row=current[i];if(!row)return;
  const f=el.dataset.simpleField;row[f]=el.type==='checkbox'?el.checked:el.value;
 });
 host.addEventListener('change',e=>{
  const el=e.target;if(!el?.dataset?.simpleField)return;
  const i=Number(el.dataset.simpleI),row=current[i];if(!row)return;
  row[el.dataset.simpleField]=el.type==='checkbox'?el.checked:el.value;
 });
 host.addEventListener('click',e=>{
  if(e.target?.id==='simpleExpenseDiscardV213'){current=[];host.querySelector('#simpleExpensePreviewV213').textContent='';return}
  if(e.target?.id!=='simpleExpenseSaveV213')return;
  const button=e.target,status=host.querySelector('#simpleExpenseStatusV213');button.disabled=true;
  try{const result=apply(current,sourceFile);status.textContent=result.skipped?'登録対象がありません。':result.cancelled?'キャンセルしました。':result.added+'件を登録しました。支出画面からいつでも編集できます。';
    if(result.added&&!result.cancelled){current=[];setTimeout(()=>{const v=host.querySelector('#simpleExpensePreviewV213');if(v)v.textContent='登録しました。'},1500);}
  }catch(err){status.textContent='登録停止：'+String(err?.message||err)}
  finally{button.disabled=false}
 });
}
// The existing main Import picker also accepts these generic rows and opens
// the editable review instead of throwing the Rakuten/unknown-header error.
function install(){
 if(typeof importOne!=='function')return false;
 if(importOne.__simpleExpenseV213)return true;
 const prior=importOne;
 importOne=async function(file){
  const name=String(file?.name||'');
  if(!/\.csv$/i.test(name))return prior(file);
  let raw=await file.text(),parsed;
  if(raw.includes('\uFFFD')&&typeof TextDecoder==='function'){
   try{raw=new TextDecoder('shift-jis').decode(await file.arrayBuffer())}catch{}
  }
  parsed=parse(raw);
  if(!parsed)return prior(file);
  mount();
  current=parsed;sourceFile=name;renderPreview();
  host?.scrollIntoView?.({block:'start',behavior:'smooth'});
  return {source:'簡易支出CSV（上部で編集・未登録）',read:parsed.length,
   added:0,duplicates:0,review:parsed.length,skipped:true};
 };
 importOne.__simpleExpenseV213=true;
 return true;
}
window.householdSimpleExpenseImportV213={parse,index,hint,plan,apply,mount,install,validate};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else setTimeout(mount,0);
if(!install())window.setTimeout?.(install,0);
})();