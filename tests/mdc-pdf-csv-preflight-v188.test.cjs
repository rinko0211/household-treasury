'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const script=fs.readFileSync('mdc-pdf-delta-v144.js','utf8');
let state={cashExpenses:[],purchaseEvents:[]};
const win={getTreasuryStateRaw:()=>state,addEventListener:()=>{}};
const context={
 window:win,document:{readyState:'loading',addEventListener:()=>{},getElementById:()=>null},
 parseCsv:t=>String(t).trim().split('\n').map(x=>x.split(',')),
 findHeader:(rows,cols)=>rows.findIndex(r=>cols.every(x=>r.includes(x))),
 rowObj:(h,r)=>Object.fromEntries(h.map((key,i)=>[key,r[i]||''])),
 parseDate:s=>s,number:s=>Number(s),hash32:s=>s.length,
 classifyMerchant:()=>({category:'OTHER',confidence:.9}),
 normalizeText:s=>s,addReview:()=>{},parseMufg:()=>null,
 Date,Intl,Number,String,Math,Array,Object,Set,Map,JSON,Error
};
vm.createContext(context);
vm.runInContext(script,context);
const api=win.householdMdcPdfDeltaV144;
const receipt={paymentDate:'2026-12-10',entries:[
 {date:'2026-10-21',merchant:'ＱＰ／フードショップ',amount:1800,count:1},
 {date:'2026-10-22',merchant:'カトリック園',amount:5600,count:1}
]};
const pdfCsv=(rows=receipt.entries)=>[
 '確定情報,ご利用日,ご利用金額（円）,ご利用店名（海外ご利用店名／海外都市名）,お支払日,MDCカード識別子,何回目,支払回数,MDC旧版CSVファイル,MDC別カードとして登録',
 ...rows.map(r=>['確定',r.date,r.amount,r.merchant,'2026-12-10','JAL-1234','','1','',''].join(','))
].join('\n');
const originalCash=[
 {id:'csv-1',date:'2026-10-21',amount:1800,description:'食品購入（QUICPay）',
  payment_method:'CASH',economic_type:'EXPENSE',category:'FOOD',cost_nature:'VARIABLE'},
 {id:'csv-2',date:'2026-10-22',amount:5600,description:'幼稚園 一時預かり保育料',
  payment_method:'CASH',economic_type:'EXPENSE',category:'CHILD',cost_nature:'VARIABLE'}
];
state={cashExpenses:structuredClone(originalCash),purchaseEvents:[]};
let p=api.previewPdf(receipt,'JAL-1234');
assert.equal(p.added,0,'CSV overlaps are not incorrectly called new');
assert.equal(p.pending.length,2,'Two cash-coded CSV entries require individual verification');
assert.equal(p.overlaps.length,2);
const first=p.pending[0],second=p.pending[1];
assert.equal(first.candidates[0].ref,'cash:0');
assert.equal(second.candidates[0].ref,'cash:1');
assert.ok(p.issues.some(x=>x.startsWith('MDC-X30:')));
assert.throws(()=>context.parseMufg({text:pdfCsv()},{name:'MDC_PDF.csv'}),/MDC-X30/);
assert.equal(state.purchaseEvents.length,0,'Blocking is atomic');
assert.deepEqual(state.cashExpenses,originalCash,'No premature cash mutation');
const approvals=Object.fromEntries([[first.token,'cash:0'],[second.token,'cash:1']]);
p=api.previewPdf(receipt,'JAL-1234',false,approvals);
assert.equal(p.pending.length,0);
assert.equal(p.added,0,'Replacing old CSV should not increase economic expense');
assert.equal(p.migratedCash,2);
const total=()=>[...state.cashExpenses,...state.purchaseEvents]
 .filter(x=>x.count_in_spending!==false)
 .reduce((sum,x)=>sum+Math.abs(Number(x.amount??x.original_amount)||0),0);
assert.equal(total(),7400);
api.setImportApprovals(receipt,'JAL-1234',approvals);
let out=context.parseMufg({text:pdfCsv()},{name:'MDC_PDF.csv'});
assert.equal(out.added,0);
assert.equal(out.migratedCash,2);
assert.equal(state.purchaseEvents.length,2);
assert.equal(state.cashExpenses.filter(x=>x.count_in_spending===false).length,2);
assert.equal(state.purchaseEvents[0].category,'FOOD','Preserve original user classification');
assert.equal(state.purchaseEvents[1].category,'CHILD');
assert.equal(state.purchaseEvents[0].cost_nature,'VARIABLE');
assert.equal(total(),7400,'After replacing CSV with PDF, total is unchanged');
out=context.parseMufg({text:pdfCsv()},{name:'MDC_PDF.csv'});
assert.equal(out.added,0,'Repeated PDF import adds nothing');
assert.equal(out.duplicates,2);
assert.equal(total(),7400);
assert.equal(state.purchaseEvents.length,2,'Repeated import cannot duplicate');

// Truly independent same-day cash purchase must never be silently absorbed.
state={cashExpenses:[{id:'independent-cash',date:'2026-10-21',amount:1800,
 description:'別店舗での現金支払',payment_method:'CASH',economic_type:'EXPENSE'}],purchaseEvents:[]};
const one={paymentDate:receipt.paymentDate,entries:[receipt.entries[0]]};
const detected=api.previewPdf(one,'JAL-1234');
assert.equal(detected.pending.length,1,'Same amount on same date requires review, not automatic absorption');
const separate={[detected.pending[0].token]:'separate'};
const clear=api.previewPdf(one,'JAL-1234',false,separate);
assert.equal(clear.added,1);
api.setImportApprovals(one,'JAL-1234',separate);
out=context.parseMufg({text:pdfCsv(one.entries)},{name:'MDC_PDF.csv'});
assert.equal(out.added,1,'Confirmed separate purchase is additive');
assert.equal(state.cashExpenses[0].count_in_spending,undefined);
assert.equal(total(),3600);

// A legacy JAL card purchase can be enriched in place, never duplicated.
state={cashExpenses:[],purchaseEvents:[{purchase_id:'csv-card',card:'MUFG/DC/JAL',
 purchase_date:'2026-10-21',merchant_raw:'食品購入',original_amount:1800,
 economic_type:'EXPENSE',category:'FOOD'}]};
const card=api.previewPdf(one,'JAL-1234');
assert.equal(card.pending.length,1);
api.setImportApprovals(one,'JAL-1234',{[card.pending[0].token]:'purchase:0'});
out=context.parseMufg({text:pdfCsv(one.entries)},{name:'MDC_PDF.csv'});
assert.equal(out.added,0);
assert.equal(state.purchaseEvents.length,1);
assert.equal(state.purchaseEvents[0].mdc_import_v144,true);
assert.equal(state.purchaseEvents[0].mdc_pdf_purchase_date,'2026-10-21');
assert.equal(total(),1800);
console.log('MDC_PDF_CSV_PREFLIGHT_V188_PASS');
