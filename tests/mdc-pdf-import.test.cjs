'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function run(){
  const code=fs.readFileSync('mdc-pdf-import-v136.js','utf8');
  const w={},d={readyState:'loading',addEventListener(){}};
  const ctx={window:w,document:d,console,Intl,Date};
  vm.runInNewContext(code,ctx);
  return w.householdMdcPdfImportV136;
}
const line=(y,...parts)=>parts.map(([x,text])=>({x,y,text}));
function fixture(sum='3,000'){
  const first={width:595,items:[
    ...line(10,[20,'ご利用明細書']),
    ...line(22,[20,'お支払日'],[140,'令和 8年11月10日']),
    ...line(34,[20,'当月ご請求額'],[310,sum+'円']),
  ]};
  const page={width:595,items:[
    ...line(11,[24,'8/ 9/22'],[60,'ＥＴＣ　仮名高速道路'],[272,'１'],[306,'1,250']),
    ...line(21,[24,'8/ 9/22'],[60,'ＥＴＣ　仮名高速道路'],[272,'１'],[306,'1,250']),
    ...line(31,[24,'8/10/ 3'],[60,'TEST STORE / APO'],[272,'１'],[306,'500'],[362,'３．０ ドル']),
    ...line(41,[362,'内海外利用事務手数料　２０円']),
  ]};
  return [first,page];
}
test('reads PDF text-layer row geometry and verifies total',()=>{
  const api=run(),p=api.readStatement(fixture());
  assert.equal(p.entries.length,3);
  assert.equal(p.total,3000);
  assert.equal(p.paymentDate,'2026-11-10');
  assert.equal(p.entries[0].date,'2026-09-22');
  assert.equal(p.entries[2].date,'2026-10-03');
});
test('retains two valid identical transactions instead of deduplicating',()=>{
  const p=run().readStatement(fixture());
  assert.equal(p.entries.filter(e=>e.amount===1250).length,2);
});
test('does not treat foreign use fee footnotes as a purchase',()=>{
  const p=run().readStatement(fixture());
  assert.equal(p.entries.length,3);
});
test('never accepts a PDF statement with a mismatched total',()=>{
  assert.throws(()=>run().readStatement(fixture('3,001')),/不一致/);
});
test('produces headers consumed by existing MUFG card import',()=>{
  const api=run(),csv=api.toCsv(api.readStatement(fixture()));
  for(const h of ['確定情報','ご利用日','ご利用金額（円）','ご利用店名（海外ご利用店名／海外都市名）','お支払日'])
    assert.ok(csv.includes(h));
  assert.ok(csv.includes('2026/11/10'));
  assert.equal(csv.split('\r\n').filter(Boolean).length,4);
});
test('rejects an unrelated or image-only PDF',()=>{
  assert.throws(()=>run().readStatement([{width:595,items:[]},{width:595,items:[]}]),/認識できません/);
});
