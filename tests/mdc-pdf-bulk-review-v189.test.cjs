'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('mdc-pdf-delta-v144.js','utf8');
let state={cashExpenses:[],purchaseEvents:[]};
const win={getTreasuryStateRaw:()=>state,addEventListener:()=>{}};
const ctx={window:win,document:{readyState:'loading',addEventListener:()=>{},getElementById:()=>null},
 parseCsv:t=>String(t).trim().split('\n').map(x=>x.split(',')),
 findHeader:(rows,keys)=>rows.findIndex(r=>keys.every(x=>r.includes(x))),
 rowObj:(headers,row)=>Object.fromEntries(headers.map((h,i)=>[h,row[i]||''])),
 parseDate:s=>s,number:s=>Number(s),hash32:s=>s.length,
 classifyMerchant:()=>({category:'OTHER',confidence:.91}),normalizeText:s=>s,
 addReview:()=>{},parseMufg:()=>null,Intl,Date,Number,Math,Array,Object,Set,Map,JSON,Error
};
vm.createContext(ctx);vm.runInContext(source,ctx);
const api=win.householdMdcPdfDeltaV144;
const parsed={paymentDate:'2026-12-10',entries:[
 {date:'2026-10-21',merchant:'ＡＰ／ＱＰ／フードショップ',amount:1800,count:1},
 {date:'2026-10-22',merchant:'カフェ',amount:650,count:1},
 {date:'2026-10-23',merchant:'公園チケット',amount:2300,count:1},
 {date:'2026-10-24',merchant:'量販店',amount:780,count:1}
]};
const csv=(p=parsed)=>[
 '確定情報,ご利用日,ご利用金額（円）,ご利用店名（海外ご利用店名／海外都市名）,お支払日,MDCカード識別子,何回目,支払回数,MDC旧版CSVファイル,MDC別カードとして登録',
 ...p.entries.map(x=>['確定',x.date,x.amount,x.merchant,p.paymentDate,'JAL-1234','','1','',''].join(','))
].join('\n');
state={cashExpenses:[
 {id:'old-edited',date:'2026-10-21',amount:1800,description:'食品購入',
  payment_method:'CASH',economic_type:'EXPENSE',category:'FOOD'}],purchaseEvents:[]};
const original=JSON.stringify(state);
const initial=api.previewPdf(parsed,'JAL-1234');
assert.equal(initial.pending.length,1,'Old CSV is a review candidate before saving');
assert.equal(initial.newRows.length,3,'All new items are exposed, not only the first six from PDF');
assert.equal(initial.existingRows.length,0);
const duplicateToken=initial.pending[0].token;
const removedNew=initial.newRows[1];
const approved={[duplicateToken]:'skip',[removedNew.token]:'skip'};
const staged=api.previewPdf(parsed,'JAL-1234',false,approved);
assert.equal(staged.skipped.length,2,'Bulk duplicate and individually excluded new entries both excluded');
assert.equal(staged.pending.length,0);
assert.equal(staged.added,2);
assert.deepEqual(Array.from(staged.newRows,r=>r.merchant),
 ['カフェ','量販店'],'Preview precisely identifies new candidate list');
assert.equal(JSON.stringify(state),original,'Preview must never mutate ledger');
api.setImportApprovals(parsed,'JAL-1234',approved);
const result=ctx.parseMufg({text:csv()},{name:'MDC_PDF_v189.csv'});
assert.equal(result.added,2,'Only selected fresh entries imported');
assert.equal(result.skipped,2);
assert.equal(state.purchaseEvents.length,2);
assert.equal(state.cashExpenses.length,1);
assert.equal(state.cashExpenses[0].count_in_spending,undefined,
 'Original edited CSV preserved, not absorbed when marked duplicate');
assert.deepEqual(state.purchaseEvents.map(r=>r.merchant_raw),['カフェ','量販店']);
const total=()=>[...state.cashExpenses,...state.purchaseEvents]
 .filter(r=>r.count_in_spending!==false)
 .reduce((a,r)=>a+Math.abs(Number(r.amount??r.original_amount)||0),0);
assert.equal(total(),3230,'Existing CSV and two genuine additions only');
// Previously imported PDF records are automatically hidden from the working
// list, irrespective of whether they were reclassified/edited by the user.
const after=api.previewPdf(parsed,'JAL-1234',false,approved);
assert.equal(after.existingRows.length,2);
assert.equal(after.newRows.length,0);
assert.equal(after.skipped.length,2);
assert.equal(after.pending.length,0);
assert.equal(after.added,0);
assert.equal(JSON.stringify(state),JSON.stringify(state));
api.setImportApprovals(parsed,'JAL-1234',approved);
const repeat=ctx.parseMufg({text:csv()},{name:'MDC_PDF_v189.csv'});
assert.equal(repeat.added,0);
assert.equal(state.purchaseEvents.length,2);
assert.equal(total(),3230,'Repeat import adds no spending');
// All-overlap selection may resolve with one bulk action while leaving
// independent equal-price purchases untouched until user explicitly decides.
state={cashExpenses:[
 {id:'old-a',date:'2026-10-21',amount:1800,description:'実際の現金支払い',economic_type:'EXPENSE',payment_method:'CASH'},
 {id:'old-b',date:'2026-10-22',amount:650,description:'手入力',economic_type:'EXPENSE',payment_method:'CASH'}
],purchaseEvents:[]};
const two={paymentDate:'2026-12-10',entries:parsed.entries.slice(0,2)};
const many=api.previewPdf(two,'JAL-1234');
assert.equal(many.pending.length,2);
assert.ok(many.pending.every(r=>r.candidates.length===1));
const bulk=Object.fromEntries(many.pending.map(r=>[r.token,'skip']));
const bulkPreview=api.previewPdf(two,'JAL-1234',false,bulk);
assert.equal(bulkPreview.added,0);
assert.equal(bulkPreview.pending.length,0);
assert.equal(bulkPreview.skipped.length,2);
api.setImportApprovals(two,'JAL-1234',bulk);
ctx.parseMufg({text:csv(two)},{name:'MDC_PDF_bulk.csv'});
assert.equal(state.purchaseEvents.length,0,'Skip all is non-mutating');
assert.equal(state.cashExpenses.length,2,'No original records deleted');
// UI regression: staged confirmation and no accidental tab navigation.
const ui=fs.readFileSync('mdc-pdf-import-v136.js','utf8');
assert.ok(ui.includes('mdcPdfBulkSkipV189'));
assert.ok(ui.includes('mdcPdfBulkAllV189'));
assert.ok(ui.includes('data-mdc-include-new'));
assert.ok(ui.includes('mdcPdfReviewV189'));
assert.ok(ui.includes('lockedReview'));
assert.ok(ui.includes('mdcPdfFinalReviewV189'));
assert.ok(ui.includes('saveBtn.hidden=true'));
assert.ok(!ui.includes("if(typeof render==='function')render();"),
 'PDF registration does not force a page-level rerender or navigation');
console.log('MDC_PDF_BULK_REVIEW_V189_PASS');
