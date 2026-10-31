/* v168: structured receipt CSV with explicit payment split and non-inflating migration. */
(() => {
'use strict';
if(window.householdStructuredExpenseV168)return;
const needed=['利用日','店舗','内容','カテゴリ','区分','購入金額_円','現金支払_円','その他決済_円',
 '支払方法','カード','決済識別子末尾','請求予定日','取込先','重複キー','計上状態','備考'];
const norm=s=>String(s||'').normalize('NFKC').toUpperCase().replace(/[\s　（）()\[\]［］\-ー・_/．.,，。]/g,'');
const monetary=v=>{const s=String(v??'').trim().replace(/[,，￥¥]/g,'');if(!/^\d+$/.test(s))throw Error('金額は正の整数で指定してください');return Number(s)};
const isDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''))&&!Number.isNaN(Date.parse(s+'T00:00:00Z'));
const csvRows=t=>{
 const rows=[];let row=[],cell='',quote=false;
 const source=String(t||'').replace(/^\uFEFF/,'');
 for(let i=0;i<source.length;i++){
  const c=source[i];
  if(c==='"'){if(quote&&source[i+1]==='"'){cell+='"';i++}else quote=!quote}
  else if(c===','&&!quote){row.push(cell);cell=''}
  else if((c==='\n'||c==='\r')&&!quote){if(c==='\r'&&source[i+1]==='\n')i++;row.push(cell);cell='';if(row.some(x=>x.trim()))rows.push(row);row=[]}
  else cell+=c;
 }
 if(quote)throw Error('CSVの引用符が閉じていません');
 row.push(cell);if(row.some(x=>x.trim()))rows.push(row);
 return rows;
};
const categoryName=category=>{
 const normalized=norm(category);
 const lookup={'食費':'FOOD','日用品':'DAILY_GOODS','娯楽レジャ':'ENTERTAINMENT',
  '娯楽':'ENTERTAINMENT','交通':'TRANSPORT','旅行':'TRAVEL','車':'CAR','子ども':'CHILD','その他':'OTHER'};
 if(lookup[normalized])return lookup[normalized];
 if(window.householdSemanticV47?.normalizeCategoryValue){
   const c=window.householdSemanticV47.normalizeCategoryValue(category);
   if(c&&window.householdSemanticV47.CATEGORY_DEFS?.[c])return c;
 }
 throw Error('未対応のカテゴリです: '+category);
};
function parse(raw){
 const rows=csvRows(raw);
 if(!rows.length||!needed.every(v=>rows[0].includes(v)))return null;
 const h=Object.fromEntries(needed.map(x=>[x,rows[0].indexOf(x)]));
 const data=[];
 for(const [i,line] of rows.slice(1).entries()){
   const item=Object.fromEntries(needed.map(x=>[x,String(line[h[x]]||'').trim()]));
   const date=item['利用日'],merchant=item['店舗'],total=monetary(item['購入金額_円']),
     cash=monetary(item['現金支払_円']),electronic=monetary(item['その他決済_円']);
   if(!isDate(date)||!merchant||!(total>0)||cash+electronic!==total)throw Error((i+2)+'行目の日付または支払金額が不正です');
   const method=norm(item['支払方法']);
   const isCash=method==='現金'||method==='CASH';
   const isJal=method==='QUICPAY'||method==='QUICPAY' || method==='クイックペイ';
   if(!isCash&&!isJal)throw Error((i+2)+'行目の支払方法はこの安全取込形式の対象外です');
   if(isCash&&(cash!==total||electronic!==0)||isJal&&(electronic!==total||cash!==0))
    throw Error((i+2)+'行目の支払方法と金額が一致しません');
   const dest=isCash?'cashExpenses':'purchaseEvents';
   if(item['取込先']!==dest)throw Error((i+2)+'行目の取込先が支払方法と一致しません');
   const dedup=item['重複キー'];
   if(!dedup.startsWith('receipt:'+date+':')||dedup.length>220)throw Error((i+2)+'行目の重複キーが不正です');
   if(isJal && (item['カード']!=='MUFG/DC/JAL'||!/^\d{4}$/.test(item['決済識別子末尾'])||
      !isDate(item['請求予定日'])||item['請求予定日']<date))
     throw Error((i+2)+'行目のJALカード・請求情報が不正です');
   data.push({date,merchant,description:item['内容'],amount:total,method:isCash?'CASH':'QUICPAY',
     card:isCash?null:'MUFG/DC/JAL',last4:item['決済識別子末尾'],
     due:item['請求予定日'],category:categoryName(item['カテゴリ']),
     spending:/特別|臨時/.test(item['区分'])?'SPECIAL':'NORMAL',dedup,note:item['備考']});
 }
 if(data.length<1||data.length>200||new Set(data.map(x=>x.dedup)).size!==data.length)
   throw Error('CSVに重複する重複キーか不正な件数があります');
 return data;
}
const counted=x=>x?.count_in_spending!==false&&x?.reconciliation_status!=='ABSORBED_DUPLICATE';
function pdfCandidate(row,pdf){
 if(!pdf?.mdc_import_v144&&!pdf?.pdf_card_identity&&!/^MDC_PDF_/i.test(String(pdf?.source_file||'')))return false;
 if(!counted(pdf)||String(pdf.card||'').toUpperCase()!=='MUFG/DC/JAL'||
   Math.abs(Number(pdf.original_amount)||0)!==row.amount)return false;
 const elapsed=Math.abs(Date.parse(pdf.purchase_date+'T00:00:00Z')-Date.parse(row.date+'T00:00:00Z'))/86400000;
 if(!Number.isFinite(elapsed)||elapsed>3)return false;
 const a=norm(row.merchant),b=norm(pdf.merchant_raw||pdf.merchant_normalized);
 if(a.includes('セブンイレブン')&&b.includes('セブンイレブン'))return true;
 return Boolean(a.length>=5&&(a.includes(b)||b.includes(a)));
}
function candidate(row,rec,kind){
 const date=kind==='cash'?rec.date:rec.purchase_date;
 const amount=Number(kind==='cash'?rec.amount:rec.original_amount);
 if(date!==row.date||Math.abs(amount)!==row.amount||!counted(rec))return false;
 const name=norm(kind==='cash'?(rec.description||rec.description_raw):rec.merchant_raw);
 const expected=norm(row.merchant);
 // The old 5-column file sometimes includes the purchase description suffix.
 // Date and amount are mandatory, but merchant must also share a meaningful prefix.
 return name.length>=3&&(name.includes(expected)||expected.includes(name)||
   (expected.includes('セブンイレブン')&&name.includes('セブンイレブン'))||
   (expected.includes('温泉')&&name.includes('温泉')));
}
function plan(input,rows,fileName=''){
 const st=structuredClone(input||{});st.cashExpenses=st.cashExpenses||[];st.purchaseEvents=st.purchaseEvents||[];
 let newCash=0,newCard=0,converted=0,existing=0,excluded=0;
 const now=new Date().toISOString(),actions=[],seen=new Set();
 for(const row of rows){
  if(seen.has(row.dedup))throw Error('CSV内の重複キーが重複しています');seen.add(row.dedup);
  // Manual deletions survive a later repeat of the same receipt CSV.
  // The old entry is retained as a tombstone, never re-inserted.
  const removed=[...(st.cashExpenses||[]),...(st.purchaseEvents||[])]
    .some(x=>x.manually_deleted_v192===true&&x.count_in_spending===false&&
      (String(x.dedup_key||'')===row.dedup||
       String(x.id||'')==='cash-expense:structured:'+row.dedup||
       String(x.purchase_id||'')==='receipt:v168:'+row.dedup));
  if(removed){existing++;actions.push({type:'manual-deleted-preserved',row});continue}
  const cash=st.cashExpenses.map((rec,i)=>({rec,i})).filter(({rec})=>candidate(row,rec,'cash'));
  const purchases=st.purchaseEvents.map((rec,i)=>({rec,i})).filter(({rec})=>
    counted(rec)&&row.method==='QUICPAY'&&
    (rec.dedup_key===row.dedup||
     (String(rec.card||'')==='MUFG/DC/JAL'&&
       (candidate(row,rec,'purchase')||pdfCandidate(row,rec)))));
  if(cash.length>1||purchases.length>1)
    throw Error('同日・同額・店舗の重複候補が複数あります: '+row.merchant+' '+row.amount+'円。元明細を確認してください');
  if(row.method==='CASH'){
   if(purchases.length)throw Error('現金として指定された取引がカード購入に既存登録されています');
   if(cash.length){existing++;actions.push({type:'cash-existing',row});continue}
   st.cashExpenses.push({
    id:'cash-expense:structured:'+row.dedup,record_kind:'CASH_EXPENSE',economic_type:'EXPENSE',
    date:row.date,description:row.merchant,amount:row.amount,payment_method:'CASH',
    category:row.category,subcategory:'OTHER',spending_class:row.spending,
    expense_scope:row.spending,ordinary_or_special:row.spending==='SPECIAL'?'SPECIAL':'ORDINARY',
    count_in_spending:true,dedup_key:row.dedup,source_file:fileName,note:row.note,imported_at:now
   });
   newCash++;actions.push({type:'cash-new',row});
   continue;
  }
  // Cash rows created by the old 5-column CSV must be retired BEFORE the
  // card purchase is added, without deleting the original audit record.
  if(cash.length){
   const old=cash[0].rec;
   old.count_in_spending=false;old.reconciliation_status='ABSORBED_DUPLICATE';
   old.payment_reclassification_reason='QUICPAY_JAL_V168';
   old.card_purchase_dedup_key=row.dedup;
   old.receipt_reconciled_at=now;
   excluded++;actions.push({type:'retire-cash',row});
  }
  const existingPurchase=purchases[0]?.rec;
  const dueMonth=row.due.slice(0,7);
  const props={
   dedup_key:row.dedup,payment_method:'QUICPAY',card:'MUFG/DC/JAL',card_last4:row.last4,
   record_kind:'CARD_PURCHASE',economic_type:'EXPENSE',
   billing_month:dueMonth,settlement_due_date:row.due,expected_settlement_date:row.due,
   expected_settlement_status:'UNCONFIRMED',
   payment_route:'CARD',settlement_pending:true,no_card_settlement:false,
   category:row.category,spending_class:row.spending,expense_scope:row.spending,
   ordinary_or_special:row.spending==='SPECIAL'?'SPECIAL':'ORDINARY'
  };
  if(existingPurchase){
   // Do not revert verified merchant/date or a PDF-origin record when adding
   // late receipt evidence. Link the receipt instead.
   Object.assign(existingPurchase,props,{receipt_purchase_date:row.date,
    source_receipt_description:row.description||row.merchant,
    receipt_reconciliation_pending:!existingPurchase.mdc_import_v144,
    receipt_note:row.note});
   existing++;actions.push({type:'purchase-existing',row});
  }else{
   st.purchaseEvents.push({
    purchase_id:'receipt:v168:'+row.dedup,source_file:fileName,
    purchase_date:row.date,merchant_raw:row.merchant,merchant_normalized:norm(row.merchant),
    original_amount:row.amount,payment_amount:row.amount,purchase_total:row.amount,
    subcategory:'OTHER',occurrence_index:1,
    receipt_reconciliation_pending:true,confidence:1,review_status:'RESOLVED',
    source_receipt_description:row.description||row.merchant,
    receipt_purchase_date:row.date,receipt_note:row.note,
    count_in_spending:true,imported_at:now,note:row.note,...props
   });
   newCard++;actions.push({type:cash.length?'cash-to-card':'card-new',row});
  }
  if(cash.length)converted++;
 }
 const amount=rows.reduce((t,x)=>t+x.amount,0);
 const cashTotal=rows.filter(x=>x.method==='CASH').reduce((t,x)=>t+x.amount,0);
 return {next:st,actions,read:rows.length,newCash,newCard,converted,existing,excluded,
  amount,cashTotal,cardTotal:amount-cashTotal,changed:newCash+newCard+excluded+existing};
}
function applyRows(rows,fileName){
 const source=(window.getTreasuryStateRaw||window.getTreasuryState)?.();
 if(!source)throw Error('保存先の家計データが取得できません');
 const result=plan(source,rows,fileName);
 // A repeated import with identical evidence is a no-op. Never create a
 // cash/card transaction simply because a CSV filename changed.
 const equivalent=JSON.stringify(source.cashExpenses||[])===JSON.stringify(result.next.cashExpenses||[])&&
   JSON.stringify(source.purchaseEvents||[])===JSON.stringify(result.next.purchaseEvents||[]);
 if(equivalent)return {...result,changed:0,skipped:true};
 if(typeof window.replaceTreasuryState!=='function'||typeof window.treasuryRecoverySnapshot!=='function')
   throw Error('バックアップまたは保存機能が利用できません');
 window.treasuryRecoverySnapshot('支払方法構造化CSVの修正適用直前');
 const stored=window.replaceTreasuryState(result.next);
 if(stored===false)throw Error('保存できませんでした');
 window.cloudSyncOnLocalSave?.();
 window.householdExpenseUnifiedV148?.render?.();
 return result;
}
function install(){
 if(typeof importOne!=='function')return false;
 if(importOne.__structuredV168)return true;
 const prior=importOne;
 const wrapper=async function(file){
  let raw='';
  try{raw=await file.text()}catch{return prior(file)}
  const rows=parse(raw);
  if(!rows)return prior(file);
  // Generic CSV import status and PDF processing continue to run through
  // the existing Import surface. No new version-specific picker is created.
  const r=applyRows(rows,file.name);
  return {source:'支払方法付き購入CSV',detectedType:'mixed_expense',read:r.read,
   added:r.newCash+r.newCard,duplicates:r.existing,corrected:r.converted,
   review:0,latest:rows.map(x=>x.date).sort().at(-1)||'',paymentSplit:{cash:r.cashTotal,card:r.cardTotal}};
 };
 wrapper.__structuredV168=true;
 importOne=wrapper;
 return true;
}
window.householdStructuredExpenseV168={parse,plan,applyRows,install};
if(!install())setTimeout(install,0);
})();
