'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const code=fs.readFileSync('mdc-card-import-scope-v139.js','utf8');
function makeRuntime(purchases=[]){
  const state={purchaseEvents:purchases,reviewQueue:[]};
  let legacyCalls=0;
  const context={
    state,window:{},console,
    parseMufg:()=>{legacyCalls++;return{source:'ORIGINAL'}},
    parseCsv:s=>String(s).trim().split(/\r?\n/).map(l=>l.split(',').map(x=>x.replace(/^"|"$/g,''))),
    findHeader:(rows,needles)=>rows.findIndex(r=>needles.every(x=>r.some(v=>v.includes(x)))),
    rowObj:(h,r)=>Object.fromEntries(h.map((n,i)=>[n,r[i]??''])),
    number:s=>{const v=Number(String(s).replace(/,/g,''));return Number.isFinite(v)?v:null},
    parseDate:s=>String(s).replace(/\//g,'-'),
    classifyMerchant:()=>({category:'UNKNOWN',ordinary_or_special:'ORDINARY',confidence:.4}),
    normalizeText:s=>String(s).normalize('NFKC').replace(/[\s　]+/g,'').toUpperCase(),
    hash32:s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(16)},
    addReview:()=>{},
  };
  vm.runInNewContext(code,context,{filename:'mdc-card-import-scope-v139.js'});
  const make=(identity,rows,oldFilename='')=>{
    const headers=['確定情報','ご利用日','ご利用店名（海外ご利用店名／海外都市名）','ご利用金額（円）','支払回数','何回目','お支払日','MDCカード識別子','MDC旧版CSVファイル'];
    return {type:'mufg_dc_jal_card',text:[headers.join(','),...rows.map(r=>['確定',r.date||'2026/09/22',r.merchant||'ETC',r.amount||850,'1','','2026/11/10',identity,oldFilename].join(','))].join('\r\n')};
  };
  const parse=(identity,rows,name='MDC_PDF_test.csv',oldFilename='')=>context.parseMufg(make(identity,rows,oldFilename),{name});
  return {state,parse,make,context,get legacyCalls(){return legacyCalls}};
}
test('different physical JAL cards with the same transaction must both appear',()=>{
  const s=makeRuntime(),row={date:'2026/09/22',merchant:'ETC AOMORI',amount:850};
  assert.equal(s.parse('JAL-card-1',[row],'card1.csv').added,1);
  assert.equal(s.parse('JAL-card-2',[row],'card2.csv').added,1);
  assert.equal(s.state.purchaseEvents.length,2);
  assert.equal(s.state.purchaseEvents.reduce((n,x)=>n+x.original_amount,0),1700);
  assert.ok(s.state.purchaseEvents.every(x=>x.economic_type==='EXPENSE'));
});
test('re-import of same physical card is idempotent by purchase signature and occurrence',()=>{
  const s=makeRuntime(),row={date:'2026/09/22',merchant:'ETC AOMORI',amount:850};
  assert.equal(s.parse('JAL-card-1',[row],'a.csv').added,1);
  const result=s.parse('JAL-card-1',[row],'newmonth.csv');
  assert.equal(result.added,0);assert.equal(result.duplicates,1);
});
test('two identical charges on the same physical card remain two real purchases',()=>{
  const s=makeRuntime(),row={date:'2026/09/22',merchant:'ETC AOMORI',amount:850};
  const result=s.parse('JAL-card-1',[row,row],'a.csv');
  assert.equal(result.added,2);
  assert.deepEqual(Array.from(s.state.purchaseEvents,x=>x.occurrence_index),[1,2]);
});
test('legacy PDF records upgrade in place without economic double counting',()=>{
  const old={card:'MUFG/DC/JAL',source_file:'MDC_PDF_old.csv',purchase_date:'2026-09-22',
    merchant_raw:'ETC AOMORI',original_amount:850,occurrence_index:1,economic_type:'EXPENSE'};
  const s=makeRuntime([old]);
  const result=s.parse('JAL-card-1',[{date:'2026/09/22',merchant:'ETC AOMORI',amount:850}],
    'MDC_PDF_new.csv','MDC_PDF_old.csv');
  assert.equal(result.added,0);assert.equal(result.upgraded,1);
  assert.equal(s.state.purchaseEvents.length,1);
  assert.equal(old.pdf_card_identity,'JAL-card-1');
});
test('normal MUFG CSV still uses original import parser unchanged',()=>{
  const s=makeRuntime();
  const src=s.make('JAL-card-1',[{amount:850}]);
  src.text=src.text.replace(/,MDCカード識別子,MDC旧版CSVファイル/,'');
  const result=s.context.parseMufg(src,{name:'normal.csv'});
  assert.equal(result.source,'ORIGINAL');
  assert.equal(s.legacyCalls,1);
});
test('the spending month is the purchase month, not the statement billing month',()=>{
  const s=makeRuntime(),row={date:'2026/09/22',merchant:'ETC',amount:850};
  s.parse('JAL-card-1',[row]);
  const x=s.state.purchaseEvents[0];
  assert.equal(x.purchase_date.slice(0,7),'2026-09');
  assert.equal(x.billing_month,'2026-11');
  assert.equal(x.economic_type,'EXPENSE');
});

test('unscoped MUFG card CSV purchase is adopted without double counting PDF and CSV',()=>{
  const original={card:'MUFG/DC/JAL',source_file:'2026-2025.csv',purchase_date:'2026-09-22',
    merchant_raw:'ETC AOMORI',original_amount:850,occurrence_index:1,economic_type:'EXPENSE'};
  const s=makeRuntime([original]),row={date:'2026/09/22',merchant:'ETC AOMORI',amount:850};
  const a=s.parse('JAL-card-1',[row],'pdf1.csv');
  assert.equal(a.added,0);
  assert.equal(a.upgraded,1);
  assert.equal(s.state.purchaseEvents.length,1);
  assert.equal(original.pdf_card_identity,'JAL-card-1');
  const b=s.parse('JAL-card-2',[row],'pdf2.csv');
  assert.equal(b.added,1);
  assert.equal(s.state.purchaseEvents.length,2);
  assert.equal(s.state.purchaseEvents.reduce((n,p)=>n+p.original_amount,0),1700);
});
