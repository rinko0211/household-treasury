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

test('seventeen synthetic MDC rows with real statement geometry reconcile to invoice',()=>{
  const api=run();
  const base={width:595,items:[
    ...line(13,[20,'ご利用明細書']),
    ...line(112.8,[35,'お支払日']),...line(112.4,[152,'令和 8年11月10日']),
    ...line(181.4,[38,'当月お支払合計額'],[158,'当月ご請求額']),
    ...line(181.0,[223,'52,170']),...line(180.6,[296,'円'])
  ]};
  const page={width:595,items:[]};
  for(let i=0;i<17;i++){
    const y=104.0+10.1*i+(i>12?20.2:0);
    const num=i===16?4170:3000;
    page.items.push(...line(y,[21.4,i<9?'8/ 9/22':'8/10/ 3'],
      [60.3,'ＴＥＳＴ　架空利用先 '+String(i+1)],[270.5,'１']));
    page.items.push(...line(y-0.9,[304.0,num.toLocaleString('en-US')]));
    if(i===12)page.items.push(...line(y+10.1,[354.6,'内海外利用事務手数料　２０円']));
  }
  const parsed=api.readStatement([base,page]);
  assert.equal(parsed.entries.length,17);
  assert.equal(parsed.total,52170);
  assert.equal(parsed.entries.reduce((n,e)=>n+e.amount,0),52170);
  assert.equal(parsed.paymentDate,'2026-11-10');
});
test('fragmented vertically shifted salary-date-like payment header is still detected',()=>{
  const api=run(),pages=fixture();
  pages[0].items=pages[0].items.filter(x=>x.text!=='令和 8年11月10日');
  pages[0].items.push(...line(26.1,[141,'令和 8年'],[209,'11月10日']));
  assert.equal(api.readStatement(pages).paymentDate,'2026-11-10');
});

test('PDF account identity is derived from masked card number; second physical card differs',()=>{
  const api=run(),first=fixture(),other=fixture();
  first[0].items.push(...line(48,[125,'会員番号'],[260,'4534-41XX-XXXX-90XX']));
  other[0].items.push(...line(48,[125,'会員番号'],[260,'4534-41XX-XXXX-91XX']));
  const a=api.readStatement(first),b=api.readStatement(other);
  assert.equal(a.cardIdentityDetected,true);
  assert.equal(b.cardIdentityDetected,true);
  assert.notEqual(a.cardLabel,b.cardLabel);
});
test('new scoped CSV contains card identity and links legacy original converter file',()=>{
  const api=run(),p=api.readStatement(fixture());
  const old=api.toLegacyCsv(p);
  const next=api.toCsv(p,'JAL-SECOND','MDC_PDF_old.csv');
  assert.ok(!old.includes('MDCカード識別子'));
  assert.ok(next.includes('MDCカード識別子'));
  assert.ok(next.includes('JAL-SECOND'));
  assert.ok(next.includes('MDC_PDF_old.csv'));
});
