'use strict';
// v192 regression: post-import PDF mutation must remain retired.
// Official statements are immutable sources; manual entries are managed in Expenses.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const pdf=fs.readFileSync('mdc-pdf-delta-v144.js','utf8');
const importer=fs.readFileSync('mdc-pdf-import-v136.js','utf8');
const cross=fs.readFileSync('mdc-cross-source-reconcile-v166.js','utf8');
const st={purchaseEvents:[{
 purchase_id:'pdf-original',purchase_date:'2026-10-23',original_amount:2441,
 card:'MUFG/DC/JAL',pdf_card_identity:'JAL-1234',
 merchant_raw:'セブンイレブン',billing_month:'2026-12',
 source_file:'MDC_PDF_2026-12.csv',mdc_import_v144:true
}],cashExpenses:[]};
const w={getTreasuryStateRaw:()=>st,addEventListener:()=>{}};
const ctx={window:w,document:{readyState:'loading',addEventListener:()=>{},getElementById:()=>null},
 parseCsv:t=>String(t).split('\n').map(x=>x.split(',')),
 findHeader:(x,c)=>x.findIndex(r=>c.every(y=>r.includes(y))),
 rowObj:(h,r)=>Object.fromEntries(h.map((x,i)=>[x,r[i]||''])),
 parseDate:x=>x,number:Number,hash32:x=>x.length,
 classifyMerchant:()=>({category:'FOOD',confidence:1}),
 normalizeText:x=>x,addReview:()=>{},parseMufg:()=>null,
 Intl,Date,Number,Math,String,Set,Map,JSON,Error};
vm.createContext(ctx);vm.runInContext(pdf,ctx);
const api=w.householdMdcPdfDeltaV144;
assert.equal(api.registeredRowsV190,undefined,'Old PDF exclusion manager not exposed');
assert.equal(api.applyPostImportV190,undefined,'Cannot modify canonical PDF records');
assert.equal(api.mountRegisteredV190,undefined,'PDF exclusion UI removed');
assert.ok(!importer.includes('mdcPdfManageRegisteredV190'));
assert.ok(!pdf.includes('mdcRepairSelectedV144'),'Even exact PDF duplicates cannot be deleted in Import');
assert.ok(!cross.includes("if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount"));
assert.equal(st.purchaseEvents[0].count_in_spending,undefined);
assert.equal(api.duplicatesAudit(st).length,0);
const p=api.previewPdf({paymentDate:'2026-12-10',
 entries:[{date:'2026-10-23',merchant:'セブンイレブン',amount:2441,count:1}]},'JAL-1234');
assert.equal(p.added,0,'Existing PDF remains the canonical copy');
assert.equal(p.duplicates,1,'The original statement is recognized as already imported');
assert.equal(st.purchaseEvents[0].count_in_spending,undefined);
console.log('PDF_IMPORT_READ_ONLY_V192_PASS');