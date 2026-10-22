(() => {
'use strict';
if(window.householdReceiptCycleV158)return;
const FORMAT='RECEIPT_FIRST_V158',CSV_NAME='cycle_20261016_1022_APP_NEW_ONLY_DEDUP_SAFE.csv';
const CYCLE='cycle:2026-10-16:2026-11-17';
const q=id=>document.getElementById(id);
const norm=s=>String(s??'').normalize('NFKC').trim();
const canon=s=>norm(s).toUpperCase().replace(/[\s　()（）［］\[\]・\-_/.,，．]/g,'');
const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T12:00:00'))&&new Date(s+'T12:00:00').toISOString().slice(0,10)===s;
const equals=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const clone=x=>JSON.parse(JSON.stringify(x));
const money=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(n);
function csvRows(source){
 const result=[],row=[];let field='',quoted=false;
 const s=String(source||'').replace(/^\uFEFF/,'');
 for(let i=0;i<s.length;i++){
   const ch=s[i];
   if(ch==='"'){
     if(quoted&&s[i+1]==='"'){field+='"';i++}else quoted=!quoted;
   }else if(!quoted&&ch===','){row.push(field);field=''}
   else if(!quoted&&(ch==='\n'||ch==='\r')){
     row.push(field);field='';
     if(row.some(v=>v!==''))result.push(row.splice(0));
     else row.length=0;
     if(ch==='\r'&&s[i+1]==='\n')i++;
   }else field+=ch;
 }
 if(quoted)throw Error('CSVの引用符が閉じていません。');
 row.push(field);if(row.some(v=>v!==''))result.push(row);
 return result;
}
const categories={
 '食費':['FOOD','GROCERIES'],'外食':['FOOD','EATING_OUT'],
 '日用品・雑貨':['DAILY_GOODS','HOUSEHOLD'],'衣服・美容':['DAILY_GOODS','CLOTHING'],
 '子ども費':['CHILD','GOODS'],'印刷・事務':['DAILY_GOODS','OTHER'],
 '観光土産・贈答':['GIFTS_EVENTS','GIFT']
};
function payment(raw){
 if(raw.includes('［現金］'))return ['CASH',''];
 if(raw.includes('［PayPay］'))return ['PAYPAY','PayPay'];
 if(raw.includes('［交通系IC］'))return ['TRANSIT_IC','交通系IC'];
 if(/0492/.test(raw)&&/MUFG\/DC\/JAL/.test(raw))return ['CREDIT_CARD','MUFG/DC/JAL'];
 if(raw.includes('［クレジット'))return ['CREDIT_CARD_UNKNOWN','CARD_UNKNOWN'];
 throw Error('支払手段が読み取れません：'+raw);
}
const hex=bytes=>Array.from(bytes).map(x=>x.toString(16).padStart(2,'0')).join('');
async function sha256(s){
 if(!crypto?.subtle?.digest)throw Error('暗号学的ID生成が利用できません。HTTPSで開いてください。');
 return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))));
}
async function parse(csv){
 const parsed=csvRows(csv),header=['日付','内容','金額','カテゴリー','区分'];
 if(!parsed.length||!equals(parsed[0].map(norm),header))throw Error('専用CSVの5列（日付・内容・金額・カテゴリー・区分）が一致しません。');
 const counts=new Map(),output=[];
 for(const [i,cols] of parsed.slice(1).entries()){
   if(cols.length!==5)throw Error((i+2)+'行目の列数が5ではありません。');
   const [date,text,a,category,cls]=cols.map(norm);
   if(!validDate(date)||date<'2026-10-16'||date>'2026-10-22')throw Error((i+2)+'行目は対象期間外です。');
   if(!/^[1-9]\d*$/.test(a)||!Number.isSafeInteger(Number(a)))throw Error((i+2)+'行目の金額が不正です。');
   if(!text||!categories[category]||!['通常費','特別費'].includes(cls))throw Error((i+2)+'行目の内容・区分が不正です。');
   const [method,card]=payment(text),scope=cls==='特別費'?'SPECIAL':'NORMAL';
   const signature=[date,text,String(Number(a)),category,scope,method].join('|');
   const ordinal=(counts.get(signature)||0)+1;counts.set(signature,ordinal);
   const id='receipt:v158:'+(await sha256(signature+'|'+ordinal)).slice(0,20);
   const description=text.split('［')[0].trim(),merchant=description.split(' ')[0];
   const base={
     record_kind:method==='CASH'?'CASH_EXPENSE':'CARD_PURCHASE',
     economic_type:'EXPENSE',spending_class:scope,expense_scope:scope,ordinary_or_special:scope,
     category:categories[category][0],subcategory:categories[category][1],
     source:'RECEIPT_FIRST_V158',source_file:CSV_NAME,
     source_original_id:id,receipt_import_key:id,receipt_original_description:text,
     receipt_merchant_key:merchant,receipt_payment_instrument:method,
     count_in_spending:true,review_status:method==='CREDIT_CARD_UNKNOWN'?'NEEDS_REVIEW':'RESOLVED',
     audit_cycle:CYCLE,cycle_start:'2026-10-16',cycle_end:'2026-11-17',
     source_provenance:'USER_CSV_RECEIPT_FIRST_V158'
   };
   const amount=Number(a);
   const r=method==='CASH'?{
     ...base,id,date,description,amount,purchase_total:amount,payment_method:'CASH'
   }:{
     ...base,purchase_id:id,purchase_date:date,merchant_raw:description,merchant_normalized:merchant,
     original_amount:amount,payment_amount:amount,card,payment_method:method,
     billing_month:card==='MUFG/DC/JAL'?'2026-12':null,
     card_last4:card==='MUFG/DC/JAL'?'0492':null,
     statement_due_date:card==='MUFG/DC/JAL'?'2026-12-10':null,
     receipt_statement_status:method.startsWith('CREDIT_CARD')?'AWAITING_STATEMENT':'PAID_AT_PURCHASE',
     occurrence_index:1,installment_count:method.startsWith('CREDIT_CARD')?1:null,
     installment_number:method.startsWith('CREDIT_CARD')?1:null
   };
   output.push({array:method==='CASH'?'cashExpenses':'purchaseEvents',record:r});
 }
 if(output.length!==18||output.reduce((a,x)=>a+(x.record.purchase_total??x.record.original_amount),0)!==35215)
   throw Error('専用CSVは18件・35,215円でなければ適用しません。内容を確認してください。');
 return output;
}
function nameKey(merchant){
 const raw=canon(merchant);
 if(/よこまち|ヨコマチ|YOKOMACHI/i.test(merchant))return 'YOKOMACHI';
 if(/SERIA|セリア/i.test(merchant))return 'SERIA';
 if(/DCM/i.test(merchant))return 'DCM';
 if(/シャンブル|CHAMBRE/i.test(merchant))return 'CHAMBRE';
 return raw;
}
function sameMerchant(a,b){
 const x=nameKey(a),y=nameKey(b);
 return x.length>=4&&y.length>=4&&(x===y||x.startsWith(y)||y.startsWith(x));
}
function dayDiff(a,b){
 if(!validDate(a)||!validDate(b))return Infinity;
 return Math.abs(Date.parse(a+'T12:00:00')-Date.parse(b+'T12:00:00'))/86400000;
}
function cardCompatible(receipt,statement){
 const method=receipt.receipt_payment_instrument;
 if(!['CREDIT_CARD','CREDIT_CARD_UNKNOWN'].includes(method))return false;
 const card=canon(statement.card);
 if(card==='PAYPAY'||card.includes('SUICA')||card.includes('PASMO')||card.includes('交通系IC'))return false;
 if(method==='CREDIT_CARD_UNKNOWN')return true;
 if(!(/MUFG|NICOS|JAL|MDC|DC/.test(card)))return false;
 const identity=String(statement.pdf_card_identity||statement.card_last4||'');
 if(/\d{4}/.test(identity)&&!/0492/.test(identity))return false;
 return true;
}
function matchExistingReceipt(st,statement){
 const amount=Math.abs(Number(statement.original_amount??statement.amount));
 if(!(amount>0)||!Number.isSafeInteger(amount)||!validDate(statement.purchase_date))return null;
 const merchant=String(statement.merchant_raw||statement.merchant_normalized||'');
 const candidates=(st.purchaseEvents||[]).filter(p=>
    p.receipt_import_key&&p.count_in_spending!==false&&
    dayDiff(p.purchase_date,statement.purchase_date)<=2&&
    Number(p.original_amount)===amount&&
    cardCompatible(p,statement)&&
    sameMerchant(p.receipt_merchant_key||p.merchant_raw,merchant));
 if(candidates.length>1)throw Error('レシートとカード明細が複数候補に一致します。追加せず確認してください：'+merchant+' '+amount+'円');
 return candidates[0]||null;
}
function mergeStatement(st,statement){
 const found=matchExistingReceipt(st,statement);
 if(!found)return null;
 // Never rebrand electronic purchases or overwrite original receipt evidence.
 const original={purchase_id:found.purchase_id,merchant_raw:found.merchant_raw,
  source_file:found.source_file,receipt_import_key:found.receipt_import_key};
 const statementId=String(statement.source_original_id||statement.purchase_id||
   [statement.purchase_date,statement.merchant_raw,statement.original_amount].join('|'));
 if(found.receipt_statement_status==='MATCHED'&&found.receipt_statement_id===statementId)return found;
 if(found.receipt_statement_status==='MATCHED'&&found.receipt_statement_id!==statementId)
   throw Error('既に別の原本明細へ吸収済みのレシートです：'+found.purchase_id);
 const merged={
   statement_source_file:statement.source_file||null,
   statement_merchant_raw:statement.merchant_raw||null,
   statement_original_id:statementId,
   statement_billing_month:statement.billing_month||null,
   statement_card_identity:statement.pdf_card_identity||null
 };
 Object.assign(found,{
   card:statement.card||found.card,
   billing_month:statement.billing_month||found.billing_month,
   pdf_card_identity:statement.pdf_card_identity||found.pdf_card_identity||null,
   receipt_statement_status:'MATCHED',receipt_statement_id:statementId,
   receipt_statement:merged,review_status:'RESOLVED',
   receipt_statement_match_v158:true
 });
 found.receipt_original_fields=found.receipt_original_fields||original;
 return found;
}
function plan(st,entries){
 if(!st||!Array.isArray(st.cashExpenses)||!Array.isArray(st.purchaseEvents))throw Error('元の家計明細を読み込めません。');
 const next=clone(st),changes=[],already=[],matched=[];
 for(const {array,record} of entries){
   const id=record.id||record.purchase_id,idkey=array==='cashExpenses'?'id':'purchase_id';
   const existing=next[array].filter(x=>String(x[idkey]||'')===id);
   if(existing.length>1)throw Error('元明細IDが重複しています：'+id);
   if(existing.length===1){
     const x=existing[0];
     // Source and amount invariants must hold even after a later statement
     // enriches the receipt with an external original merchant/billing name.
     for(const key of ['source_original_id','receipt_import_key','receipt_original_description','economic_type',
       'spending_class','audit_cycle',array==='cashExpenses'?'amount':'original_amount']){
       if(!equals(x[key],record[key]))throw Error('既存レシートの原本情報が異なります：'+id+' / '+key);
     }
     already.push(id);continue;
   }
   if(array==='purchaseEvents'&&record.receipt_payment_instrument.startsWith('CREDIT_CARD')){
     // An imported statement already present must be treated as existing,
     // never create a receipt-on-top. Only unique & card-compatible matches.
     const bank=(next.purchaseEvents||[]).filter(x=>!x.receipt_import_key&&
       x.count_in_spending!==false&&x.economic_type!=='TRANSFER'&&
       Number(x.original_amount)===record.original_amount&&
       dayDiff(x.purchase_date,record.purchase_date)<=2&&
       cardCompatible(record,x)&&sameMerchant(record.receipt_merchant_key,x.merchant_raw||x.merchant_normalized));
     if(bank.length>1)throw Error('既存カード明細に複数候補があります。安全のため停止しました：'+id);
     if(bank.length===1){matched.push({id,existing:bank[0].purchase_id});continue}
   }
   next[array].push(record);changes.push({array,id,amount:record.purchase_total??record.original_amount,
       method:record.receipt_payment_instrument,scope:record.spending_class});
 }
 return {next,changes,already,matched,totalNew:changes.reduce((a,x)=>a+x.amount,0)};
}
const stateNow=()=>{try{return (window.getTreasuryStateRaw||window.getTreasuryState)?.()||{}}catch{return {}}};
function apply(st,entries){return plan(st,entries)}
function commit(entries){
 if(typeof window.treasuryRecoverySnapshot!=='function'||typeof window.replaceTreasuryState!=='function')
  throw Error('復旧履歴や安全な保存機能が利用できません。');
 const before=stateNow(),checked=plan(before,entries);
 if(!checked.changes.length)return {...checked,saved:false};
 window.treasuryRecoverySnapshot('レシート18件取込 v158 直前');
 if(window.replaceTreasuryState(checked.next)===false)throw Error('保存が拒否されました。');
 const after=plan(stateNow(),entries);
 if(after.changes.length)throw Error('保存後の照合が不一致です。復旧履歴を確認してください。');
 try{window.cloudSyncOnLocalSave?.()}catch{}
 window.dispatchEvent?.(new CustomEvent('treasury:expenses-imported',
   {detail:{source:FORMAT,months:['2026-10']}}));
 return {...checked,saved:true};
}
function mount(){
 const root=document.querySelector('#imports .grid')||q('imports');
 if(!root||q('receiptCycleImportV158'))return;
 const box=document.createElement('div');box.className='card full';box.id='receiptCycleImportV158';
 box.innerHTML='<div class="title">2026/10/16給与サイクル：18件のレシート先行取込（v158）</div>'+
 '<div class="tiny">現金は現金支出、クレジット・PayPay・交通系ICは購入イベントへ登録します。既存明細を上書きせず、同一ファイルの再取込は0件です。カード明細は後日レシートへ吸収します。</div>'+
 '<button type="button" class="btn secondary" id="receiptPickV158">専用レシートCSVを選ぶ</button>'+
 '<input type="file" id="receiptFileV158" accept=".csv,text/csv" style="display:none">'+
 '<div class="tiny" id="receiptStatusV158" role="status" style="margin-top:9px"></div>';
 root.prepend(box);q('receiptPickV158').onclick=()=>q('receiptFileV158').click();
 q('receiptFileV158').onchange=async()=>{
   const status=q('receiptStatusV158');
   try{
     const f=q('receiptFileV158').files?.[0];if(!f)return;
     if(f.size>100000)throw Error('CSVが大きすぎます。');
     const entries=await parse(await f.text()),check=plan(stateNow(),entries);
     if(!check.changes.length){status.textContent='18件はすべて登録済み、または同一原本に吸収済みです。新規0件。';return}
     const by=entries.reduce((a,x)=>{const m=x.record.receipt_payment_instrument;a[m]=(a[m]||0)+(x.record.purchase_total??x.record.original_amount);return a},{});
     const info='新規'+check.changes.length+'件 '+money(check.totalNew)+'、既存'+check.already.length+'件、原本一致'+check.matched.length+
      '件です。登録先：'+Object.entries(by).map(([k,v])=>k+' '+money(v)).join('、')+'。';
     if(!window.confirm(info+' 元データの復旧履歴を保存して追加しますか？'))return;
     const res=commit(entries);
     status.textContent='保存済み：新規'+res.changes.length+'件 '+money(res.totalNew)+'。同一CSVの再読込でも増えません。';
   }catch(e){status.textContent='未適用：'+String(e.message||e)}
   finally{q('receiptFileV158').value=''}
 };
}
window.householdReceiptCycleV158={FORMAT,CSV_NAME,CYCLE,csvRows,parse,plan,apply,commit,matchExistingReceipt,mergeStatement,mount};
const init=()=>mount();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else setTimeout(init,0);
window.addEventListener?.('treasury:pagechange',e=>{if(e?.detail?.page==='imports')setTimeout(mount,0)});
})();