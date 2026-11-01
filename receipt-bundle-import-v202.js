/* Receipt CSV transaction / item detail / provisional shopping import v202. */
(()=>{
'use strict';
if(window.householdReceiptBundleV202)return;
const n=v=>String(v??'').normalize('NFKC').trim();
const norm=v=>n(v).toUpperCase().replace(/[\s　()（）［］\[\]〔〕【】・_\-／/.,，。．]/g,'');
const validDate=v=>/^20\d\d-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(String(v||''))&&
 !Number.isNaN(Date.parse(v+'T00:00:00Z'));
const asInt=v=>/^\d+$/.test(n(v))&&Number.isSafeInteger(Number(v));
const money=v=>Math.abs(Number(v)||0);
const yen=v=>new Intl.NumberFormat('ja-JP').format(Number(v)||0)+'円';
const assert=(ok,msg)=>{if(!ok)throw Error(msg)};
const stateNow=()=> (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{};
function parseCsvText(t){
 const list=[],raw=String(t||'').replace(/^\uFEFF/,'');let line=[],cell='',quote=false;
 for(let i=0;i<raw.length;i++){
  const c=raw[i];
  if(c==='"'){if(quote&&raw[i+1]==='"'){cell+='"';i++}else quote=!quote}
  else if(c===','&&!quote){line.push(cell);cell=''}
  else if((c==='\n'||c==='\r')&&!quote){
   if(c==='\r'&&raw[i+1]==='\n')i++;
   line.push(cell);cell='';
   if(line.some(x=>n(x)))list.push(line);
   line=[];
  }else cell+=c;
 }
 assert(!quote,'CSVの引用符が閉じていません');
 line.push(cell);if(line.some(x=>n(x)))list.push(line);
 return list;
}
function read(text){
 const lines=parseCsvText(text);if(!lines.length)return null;
 const h=lines[0].map(n),has=k=>h.includes(k);
 const type=['利用日','店舗','購入金額_円','重複キー','支払方法','証憑'].every(has)?'transactions':
   ['取引ID','利用日','店舗','商品名','数量','単価_円','金額_円'].every(has)?'items':
   ['店舗','商品','表示価格_円','証憑','購入確認','支出計上'].every(has)?'amazon':'';
 if(!type)return null;
 const rs=lines.slice(1).map(line=>Object.fromEntries(h.map((key,i)=>[key,n(line[i])])));
 assert(rs.length>0&&rs.length<=300,'CSVは1〜300明細にしてください');
 const rows=rs.map((r,i)=>{
  const pos=String(i+2)+'行目: ';
  if(type==='transactions'){
   assert(validDate(r['利用日'])&&r['店舗']&&
     /^receipt:[a-z0-9:-]{10,220}$/i.test(r['重複キー'])&&
     asInt(r['購入金額_円'])&&Number(r['購入金額_円'])>0,
     pos+'レシート日・金額・識別子が不正です');
   return {key:r['重複キー'],date:r['利用日'],merchant:r['店舗'],
     amount:Number(r['購入金額_円']),payment:r['支払方法']||'未確認',
     category:r['カテゴリ']||'その他',description:r['内容']||'',
     image:r['証憑']||'',note:r['備考']||'',time:r['利用時刻']||''};
  }
  if(type==='items'){
   assert(validDate(r['利用日'])&&r['店舗']&&r['商品名']&&
     /^receipt:[a-z0-9:-]{10,220}$/i.test(r['取引ID'])&&
     asInt(r['数量'])&&Number(r['数量'])>=1&&asInt(r['単価_円'])&&
     asInt(r['金額_円'])&&Number(r['数量'])*Number(r['単価_円'])===Number(r['金額_円']),
     pos+'商品内訳の数量・金額が一致しません');
   return {key:r['取引ID'],date:r['利用日'],merchant:r['店舗'],
    label:r['商品名'],qty:Number(r['数量']),unit:Number(r['単価_円']),
    amount:Number(r['金額_円']),category:r['カテゴリ']||'その他',
    image:r['証憑']||''};
  }
  assert(r['支出計上']==='暫定計上'&&String(r['購入確認']).includes('未確認'),
   pos+'Amazon未購入候補は暫定計上を明示したv202版CSVで読み込んでください');
  assert(validDate(r['仮計上日'])&&r['店舗']&&r['商品']&&r['証憑']&&
   asInt(r['表示価格_円'])&&Number(r['表示価格_円'])>0&&
   asInt(r['数量仮定'])&&Number(r['数量仮定'])>=1,pos+'仮計上日・価格・数量が不正です');
  return {date:r['仮計上日'],merchant:r['店舗'],label:r['商品'],
   unit:Number(r['表示価格_円']),qty:Number(r['数量仮定']),
   amount:Number(r['表示価格_円'])*Number(r['数量仮定']),
   variant:[r['選択サイズ'],r['選択色']].filter(Boolean).join(' / '),
   image:r['証憑'],note:r['備考']||''};
 });
 return {type,rows};
}
const category=s=>/子ども用品/.test(s)?'CHILD':/食費/.test(s)?'FOOD':
 /日用品/.test(s)?'DAILY_GOODS':'OTHER';
const method=s=>s==='現金'?'CASH':/QUICPay/i.test(s)?'QUICPAY':
 /電子マネー/.test(s)?'E_MONEY_UNIDENTIFIED':'UNCONFIRMED';
function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){
 h^=s.charCodeAt(i);h=Math.imul(h,16777619)}
 return (h>>>0).toString(16);
}
function exact(st,key){
 const matches=[];
 for(const arr of [st.cashExpenses||[],st.purchaseEvents||[]]){
  for(const r of arr)if(r.dedup_key===key||r.receipt_bundle_key_v202===key||
   String(r.id||r.purchase_id||'')==='cash-expense:structured:'+key)matches.push(r);
 }
 return matches;
}
function overlapping(st,p){
 const list=[...(st.cashExpenses||[]).map(r=>({r,kind:'cash'})),
  ...(st.purchaseEvents||[]).map(r=>({r,kind:'card'}))];
 return list.some(({r,kind})=>{
  if(r.count_in_spending===false||r.manually_deleted_v192===true)return false;
  const date=kind==='cash'?r.date:r.purchase_date;
  const sum=kind==='cash'?r.amount:r.original_amount;
  const label=kind==='cash'?r.description||r.description_raw:r.merchant_raw||r.merchant_normalized;
  return date===p.date&&money(sum)===p.amount&&norm(label)===norm(p.merchant);
 });
}
function plan(data,parsed,name=''){
 assert(parsed&&Array.isArray(parsed.rows)&&['transactions','items','amazon'].includes(parsed.type),'CSV形式が不正です');
 const st=structuredClone(data||{}),now=new Date().toISOString();
 st.cashExpenses=Array.isArray(st.cashExpenses)?st.cashExpenses:[];
 st.purchaseEvents=Array.isArray(st.purchaseEvents)?st.purchaseEvents:[];
 st.receiptItemDetailsV202=Array.isArray(st.receiptItemDetailsV202)?st.receiptItemDetailsV202:[];
 const result={next:st,type:parsed.type,read:parsed.rows.length,
   newPurchases:0,details:0,duplicates:0,updated:0,review:0,provisional:0,newSpending:0};
 const register=(p,itemOnly=false)=>{
  const hits=exact(st,p.key);
  assert(hits.length<=1,'同一レシートIDが複数登録されています: '+p.key);
  if(hits.length){
   const r=hits[0],storedDate=r.purchase_date||r.date;
   const sum=money(r.original_amount??r.purchase_total??r.amount);
   assert(storedDate===p.date&&sum===p.amount,'レシートIDは同じですが日付・金額が異なります');
   if(r.count_in_spending===false||r.manually_deleted_v192===true){
    result.duplicates++;return;
   }
   if(r.receipt_bundle_v202&&r.receipt_payment_unresolved_v202&&!itemOnly){
    r.payment_method=method(p.payment);
    r.receipt_payment_unresolved_v202=r.payment_method==='UNCONFIRMED';
    r.receipt_original_source_v202=p.image;r.receipt_original_note_v202=p.note;
    r.receipt_time_v202=p.time;
    r.review_status=r.payment_method==='CASH'?'RESOLVED':'NEEDS_REVIEW';
    result.updated++;
   }else result.duplicates++;
   return;
  }
  assert(!overlapping(st,p),'同日・同店・同額の支出 '+p.merchant+' '+yen(p.amount)+
   ' は既に登録されています。二重計上を避けるため登録を中止しました。横断重複点検で確認してください。');
  const pay=itemOnly?'UNCONFIRMED':method(p.payment);
  st.cashExpenses.push({
   id:'receipt-v202:'+p.key,receipt_bundle_key_v202:p.key,dedup_key:p.key,
   receipt_bundle_v202:true,receipt_payment_unresolved_v202:pay==='UNCONFIRMED',
   date:p.date,description:p.merchant,amount:p.amount,
   record_kind:'RECEIPT_PURCHASE',economic_type:'EXPENSE',
   category:category(p.category||''),subcategory:'OTHER',
   cost_nature:'VARIABLE',spending_class:'NORMAL',expense_scope:'NORMAL',
   ordinary_or_special:'ORDINARY',payment_method:pay,
   receipt_source_payment_v202:itemOnly?'商品内訳のみ':p.payment,
   receipt_original_source_v202:p.image||'',receipt_original_note_v202:p.note||'',
   receipt_time_v202:p.time||'',source_file:name,
   manual_reconciliation_pending:true,review_status:pay==='CASH'?'RESOLVED':'NEEDS_REVIEW',
   count_in_spending:true,imported_at:now
  });
  result.newPurchases++;result.newSpending+=p.amount;
  if(pay!=='CASH')result.review++;
 };
 if(parsed.type==='transactions'){
  const seen=new Set();
  for(const p of parsed.rows){
   assert(!seen.has(p.key),'CSV内の取引IDが重複しています');seen.add(p.key);
   register(p);
  }
 }else if(parsed.type==='items'){
  const groups=new Map();
  for(const [i,p] of parsed.rows.entries()){
   if(!groups.has(p.key))groups.set(p.key,{date:p.date,merchant:p.merchant,total:0,rows:[]});
   const g=groups.get(p.key);
   assert(g.date===p.date&&norm(g.merchant)===norm(p.merchant),
    '同一の取引IDに別の日時・店舗が混在しています');
   g.total+=p.amount;g.rows.push({...p,line:i+1});
  }
  for(const [key,g] of groups){
   register({key,date:g.date,merchant:g.merchant,amount:g.total,
     category:g.rows.some(x=>category(x.category)==='CHILD')?'子ども用品':'食費'},true);
   for(const p of g.rows){
    const id='line-v202:'+p.key+':'+p.line;
    const old=st.receiptItemDetailsV202.find(x=>x.id===id);
    if(old){
     assert(old.amount===p.amount&&old.label===p.label&&old.qty===p.qty,
      '同一商品IDの内容が変わっています');result.duplicates++;continue;
    }
    st.receiptItemDetailsV202.push({
     id,receipt_key:key,date:p.date,merchant:p.merchant,label:p.label,
     qty:p.qty,unit_price:p.unit,amount:p.amount,category:category(p.category),
     source_image:p.image,source_file:name,record_kind:'RECEIPT_LINE',
     count_in_spending:false
    });result.details++;
   }
  }
 }else{
  const seen=new Set();
  for(const p of parsed.rows){
   const key='amazon-provisional:'+p.date+':'+norm(p.image)+':'+hash(norm(p.label)+'|'+norm(p.variant));
   assert(!seen.has(key),'同じAmazon商品候補が重複しています');seen.add(key);
   const prior=st.cashExpenses.find(x=>x.dedup_key===key||x.id===key);
   if(prior){
    assert(money(prior.amount)===p.amount,'既存の仮計上と金額が異なります。修正は支出ページで行ってください');
    result.duplicates++;continue;
   }
   st.cashExpenses.push({
    id:key,dedup_key:key,date:p.date,description:p.label,amount:p.amount,
    category:/セーター|シャツ|パンツ|こども|キッズ/.test(p.label)?'CHILD':'DAILY_GOODS',
    subcategory:'OTHER',cost_nature:'VARIABLE',spending_class:'NORMAL',
    expense_scope:'NORMAL',ordinary_or_special:'ORDINARY',economic_type:'EXPENSE',
    record_kind:'ESTIMATED_BUDGET_EXPENSE',count_in_spending:true,
    payment_method:'UNCONFIRMED_PROVISIONAL',payment_route:'NOT_SETTLED',
    manual_reconciliation_pending:true,review_status:'NEEDS_REVIEW',
    provisional_budget_v202:true,provisional_attribution:true,
    purchase_confirmed_v202:false,reference_price_v202:p.unit,
    provisional_variant_v202:p.variant,provisional_qty_v202:p.qty,
    provisional_price_excludes_shipping_v202:true,
    source_file:name,provisional_source_image_v202:p.image,
    imported_at:now,note:'商品画面のみ・購入未確認。送料/割引を含まない仮予算。 '+p.note
   });
   result.newPurchases++;result.newSpending+=p.amount;result.provisional++;result.review++;
  }
 }
 result.changed=result.newPurchases+result.details+result.updated;
 return result;
}
function apply(parsed,name='',confirmFn=window.confirm?.bind(window)){
 const before=plan(stateNow(),parsed,name);
 if(!before.changed)return {...before,skipped:true};
 assert(typeof confirmFn==='function','取込確認機能がありません');
 const warning=parsed.type==='amazon'?
   '\nAmazon商品ページのみ：未注文の可能性があります。送料は未計上。予算上のみ暫定支出にします。':
   parsed.type==='items'?'\n親取引が存在しない場合は1件の支出を作り、商品内訳は追加計上しません。':
   '\n支払方法が未確認でも購入支出として計上します。カード請求・銀行残高は作成しません。';
 if(!confirmFn('CSVの種類：'+parsed.type+'\n追加支出 '+before.newPurchases+
   '件 '+yen(before.newSpending)+'／商品内訳 '+before.details+
   '件／既存 '+before.duplicates+'件／確認要 '+before.review+'件'+warning+
   '\n復旧履歴を残して登録しますか？'))return {...before,cancelled:true};
 const fresh=plan(stateNow(),parsed,name);
 assert(fresh.changed===before.changed&&fresh.newSpending===before.newSpending,
  '確認中に家計データが変更されました。読み直してください');
 assert(typeof window.replaceTreasuryState==='function'&&
  typeof window.treasuryRecoverySnapshot==='function','復旧履歴・保存が利用できません');
 window.treasuryRecoverySnapshot('レシートCSV・内訳・暫定支出の取込前');
 assert(window.replaceTreasuryState(fresh.next)!==false,'保存に失敗しました');
 window.cloudSyncOnLocalSave?.();
 window.dispatchEvent?.(new CustomEvent('treasury:expenses-imported',{detail:{source:'RECEIPT_CSV_V202'}}));
 window.householdExpenseUnifiedV148?.render?.();
 return fresh;
}
let memoState=null,memoIndex=null;
function detailsFor(st,identity){
 if(st!==memoState){
  memoState=st;memoIndex=new Map();
  for(const item of st?.receiptItemDetailsV202||[]){
   if(!memoIndex.has(item.receipt_key))memoIndex.set(item.receipt_key,[]);
   memoIndex.get(item.receipt_key).push(item);
  }
 }
 const m=String(identity||'').match(/^(cash|purchase):(\d+)$/);
 if(!m)return [];
 const r=m[1]==='cash'?st.cashExpenses?.[Number(m[2])]:st.purchaseEvents?.[Number(m[2])];
 const key=r?.dedup_key||r?.receipt_bundle_key_v202;
 return key?[...(memoIndex.get(key)||[])]:[];
}
function install(){
 if(typeof importOne!=='function')return false;
 if(importOne.__receiptBundleV202)return true;
 const prev=importOne;
 importOne=async function(file){
  let parsed;
  try{parsed=read(await file.text())}catch(e){throw e}
  if(!parsed)return prev(file);
  const r=apply(parsed,file.name);
  return {source:'レシート/内訳/Amazon仮計上',detectedType:'receipt_v202_'+r.type,
   read:r.read,added:r.newPurchases,duplicates:r.duplicates,
   review:r.review,detailItems:r.details,provisional:r.provisional,
   estimatedSpend:r.newSpending,skipped:!!r.skipped,cancelled:!!r.cancelled};
 };
 importOne.__receiptBundleV202=true;return true;
}
window.householdReceiptBundleV202={read,plan,apply,detailsFor,install,parseCsvText};
if(!install())window.setTimeout?.(install,0);
})();