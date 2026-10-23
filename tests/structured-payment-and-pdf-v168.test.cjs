'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('structured-expense-import-v168.js','utf8');
const pdfEngine=fs.readFileSync('mdc-pdf-delta-v144.js','utf8');
const csv=['利用日,店舗,内容,カテゴリ,区分,購入金額_円,現金支払_円,その他決済_円,支払方法,カード,決済識別子末尾,請求予定日,取込先,重複キー,計上状態,備考',
'2026-10-23,温泉チケット,温泉チケット,娯楽・レジャー,特別費,4000,4000,0,現金,,,,cashExpenses,receipt:2026-10-23:onsen-ticket:4000:cash,確定,現金',
'2026-10-23,セブンイレブンテスト店,食品と日用品,食費,通常費,2441,0,2441,QUICPay,MUFG/DC/JAL,9999,2026-12-10,purchaseEvents,receipt:2026-10-23:seven-test:2441:quicpay:9999,確定,カードで支払い'].join('\n');
let state={cashExpenses:[],purchaseEvents:[],imports:[]};
const snapshots=[],sync=[];
const window={
 getTreasuryStateRaw:()=>state,
 householdSemanticV47:{CATEGORY_DEFS:{ENTERTAINMENT:{label:'娯楽'},FOOD:{label:'食費'}},normalizeCategoryValue:()=>null},
 treasuryRecoverySnapshot:x=>snapshots.push(x),
 replaceTreasuryState:s=>{state=structuredClone(s);return true},
 cloudSyncOnLocalSave:()=>sync.push('sync'),
 householdExpenseUnifiedV148:{render:()=>{}}
};
const ctx={window,document:{},setTimeout:()=>{},Date,Intl,Number,Math,String,Array,Object,Set,Map,JSON,Error,structuredClone,
 importOne:async()=>{throw Error('Other parser mistakenly called')}};
vm.createContext(ctx);
vm.runInContext(source,ctx);
const api=window.householdStructuredExpenseV168;
assert.ok(api);
const rows=api.parse('\uFEFF'+csv);
assert.equal(rows.length,2);
assert.equal(rows[0].category,'ENTERTAINMENT');
assert.equal(rows[1].method,'QUICPAY');
assert.equal(rows[1].due,'2026-12-10');
const sum=st=>[...(st.cashExpenses||[]),...(st.purchaseEvents||[])].filter(x=>x.count_in_spending!==false)
 .reduce((t,x)=>t+Number(x.amount??x.original_amount??0),0);
(async()=>{
 let res=await ctx.importOne({name:'synthetic_v168.csv',text:async()=>csv});
 assert.equal(res.added,2);
 assert.equal(state.cashExpenses.length,1);
 assert.equal(state.purchaseEvents.length,1);
 assert.equal(sum(state),6441);
 assert.equal(state.purchaseEvents[0].card,'MUFG/DC/JAL');
 assert.equal(state.purchaseEvents[0].billing_month,'2026-12');
 assert.equal(state.purchaseEvents[0].settlement_due_date,'2026-12-10');
 assert.equal(state.purchaseEvents[0].payment_method,'QUICPAY');
 assert.equal(state.cashExpenses[0].payment_method,'CASH');
 res=await ctx.importOne({name:'syn_second.csv',text:async()=>csv});
 assert.equal(res.added,0,'Second receipt CSV should not create any spend');
 assert.equal(sum(state),6441,'Idempotent repeat import');
 // Restart with legacy 5-column CSV entries both incorrectly classified CASH.
 state={cashExpenses:[
  {id:'old-1',date:'2026-10-23',description:'温泉チケット',amount:4000,payment_method:'CASH',economic_type:'EXPENSE'},
  {id:'old-2',date:'2026-10-23',description:'セブンイレブンテスト店 食品と日用品',amount:2441,payment_method:'CASH',economic_type:'EXPENSE'}
 ],purchaseEvents:[]};
 const before=sum(state);
 const result=api.applyRows(rows,'structured.csv');
 assert.equal(before,6441);
 assert.equal(result.converted,1);
 assert.equal(result.newCard,1);
 assert.equal(result.newCash,0);
 assert.equal(sum(state),6441,'Migration must not inflate consumption');
 assert.equal(state.cashExpenses[1].count_in_spending,false);
 assert.equal(state.cashExpenses[1].reconciliation_status,'ABSORBED_DUPLICATE');
 assert.equal(state.purchaseEvents[0].original_amount,2441);
 assert.equal(api.applyRows(rows,'structured.csv').changed,0,'Repeat is a no-op');
 // Future JAL PDF received 1 day apart, with a short merchant alias.
 const pdf=ctx.window.householdStructuredExpenseV168;
 const pdfContext={
  document:{readyState:'loading',addEventListener:()=>{},getElementById:()=>null},
  state,window:{getTreasuryStateRaw:()=>state,addEventListener:()=>{}} ,
  parseCsv:t=>String(t).split('\n').map(x=>x.split(',')),
  findHeader:(data,keys)=>data.findIndex(r=>keys.every(x=>r.includes(x))),
  parseDate:s=>s,number:s=>Number(s),hash32:s=>42,
  classifyMerchant:()=>({category:'FOOD',confidence:.9}),
  normalizeText:s=>s,addReview:()=>{},
  parseMufg:()=>null,Date,Intl,Number,Math,String,Array,Object,Set,Map,JSON,Error
 };
 vm.createContext(pdfContext);vm.runInContext(pdfEngine,pdfContext);
 const parsed={paymentDate:'2026-12-10',entries:[{date:'2026-10-22',merchant:'ＡＰ／ＱＰ／セブン－イレブン',amount:2441,count:1}]};
 const p=pdfContext.window.householdMdcPdfDeltaV144.previewPdf(parsed,'末尾9999');
 assert.equal(p.added,0,'PDF matches existing receipt rather than adding a purchase');
 assert.equal(p.receiptAbsorbed,1);
 assert.equal(p.updates.length,1);
 assert.equal(p.issues.length,0);
 // Simulate actual importScoped via PDF-specific synthetic statement CSV.
 const headers=['確定情報','ご利用日','ご利用金額（円）','ご利用店名（海外ご利用店名／海外都市名）','お支払日',
 'MDCカード識別子','何回目','支払回数','MDC旧版CSVファイル','MDC別カードとして登録'];
 const values=['確定','2026-10-22','2441','ＡＰ／ＱＰ／セブン－イレブン','2026-12-10','末尾9999','','1','',''];
 const statement=headers.join(',')+'\n'+values.join(',');
 const done=pdfContext.parseMufg({text:statement},{name:'synthetic_MDC_PDF.csv'});
 assert.equal(done.added,0);
 assert.equal(done.receiptAbsorbed,1);
 assert.equal(sum(state),6441);
 assert.equal(state.purchaseEvents.length,1);
 assert.equal(state.purchaseEvents[0].purchase_date,'2026-10-23','Retain receipt purchase date');
 assert.equal(state.purchaseEvents[0].mdc_pdf_purchase_date,'2026-10-22');
 assert.equal(state.purchaseEvents[0].receipt_reconciliation_pending,false);
 const again=pdfContext.parseMufg({text:statement},{name:'synthetic_MDC_PDF.csv'});
 assert.equal(again.added,0);
 assert.equal(again.receiptAbsorbed,0);
 assert.equal(state.purchaseEvents.length,1);
 assert.equal(sum(state),6441,'Reimport must not change spending');
 // A same-price receipt from a different card must not be absorbed.
 const other=structuredClone(state.purchaseEvents[0]);
 other.purchase_id='different-card';other.card='Rakuten';other.mdc_import_v144=false;other.pdf_card_identity='';
 other.mdc_pdf_signature_v168='';other.receipt_reconciliation_pending=true;
 state.purchaseEvents.push(other);
 const newPdf={paymentDate:'2026-12-10',entries:[{date:'2026-10-24',merchant:'ＡＰ／ＱＰ／セブン－イレブン',amount:2441,count:1}]};
 const scoped=pdfContext.window.householdMdcPdfDeltaV144.previewPdf(newPdf,'末尾9999');
 assert.equal(scoped.added,1,'Different statement usage is a new expense');
 // Rollback the test-only other-card row.
 console.log('STRUCTURED_PAYMENT_AND_PDF_V168_PASS');
})().catch(err=>{console.error(err);process.exitCode=1});
