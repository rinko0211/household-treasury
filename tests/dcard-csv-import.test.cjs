'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {parseCsvV73}=require('../csv-parser-v73.js');
const importer=fs.readFileSync('dcard-csv-import-v140.js','utf8');
const analytics=fs.readFileSync('cash-expense-analytics-v106.js','utf8');

const rows=[
 ['2026-11','2026-09-25','SAMPLE CAFE …','1000','1回払い','本人','名称省略表示'],
 ['2026-11','2026-09-18','TEST SWEETS …','8424','1回払い','本人','名称省略表示'],
 ['2026-11','2026-09-18','JAL国内線航空券類','7040','1回払い','本人',''],
 ['2026-11','2026-09-18','AIRPORT TEST TERMINAL','3240','1回払い','本人',''],
 ['2026-10','2026-09-03','モバイルPASMOチャージ','10000','1回払い','','チャージ（資金移動）。利用時の支出と二重計上しない']
];
const header=['請求月','利用日','利用先','金額（円）','支払方法','利用者','備考'];
function csv(data=rows,head=header) {
  const q=v=>'"'+String(v).replace(/"/g,'""')+'"';
  return '\uFEFF'+[head,...data].map(r=>r.map(q).join(',')).join('\r\n')+'\r\n';
}
function sandbox(){
  const state={purchaseEvents:[],cashTransactions:[],cashExpenses:[],cardSettlements:[],reviewQueue:[]};
  const win={getTreasuryStateRaw:()=>state};
  const document={readyState:'loading',addEventListener(){}};
  const klass=s=>String(s||'').normalize('NFKC').replace(/[\s　]+/g,'').toUpperCase();
  const hash32=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return(h>>>0).toString(16)};
  const context={
    window:win,document,state,TextDecoder,console,Date,Intl,
    parseCsv:parseCsvV73,normalizeText:klass,hash32,
    addReview:x=>state.reviewQueue.push(x),
    importOne:async()=>({source:'ORIGINAL'}),
    parseMufg:()=>({source:'ORIGINAL'}),
    detectSource:()=>({type:'unknown',text:''}),
    CustomEvent:class {},
  };
  vm.runInNewContext(importer,context,{filename:'dcard-csv-import-v140.js'});
  vm.runInNewContext(analytics,context,{filename:'cash-expense-analytics-v106.js'});
  return {context,state,win,parse:(text=csv())=>context.parseMufg({text,dcard_source:true},{name:'sample_dcard.csv'})};
}

test('recognizes UTF-8/BOM d-card header by contents even when filename is generic',()=>{
  const {context}=sandbox();
  const result=context.detectSource({name:'data_2026.csv'},Buffer.from(csv(),'utf8'));
  assert.equal(result.type,'mufg_dc_jal_card');
  assert.equal(result.dcard_source,true);
  assert.equal(result.encoding,'utf-8');
});
test('real 7-column layout: five imported, correct billing months, 19,704 yen expenses, 10,000 yen top-up',()=>{
  const {state,parse}=sandbox(),result=parse();
  assert.equal(result.read,5);assert.equal(result.added,5);
  assert.equal(result.source,'dカード');
  assert.equal(result.fileUsageTotal,29704);
  assert.equal(result.fileSpendingTotal,19704);
  assert.equal(result.fileTransferTotal,10000);
  assert.equal(result.addedByBillMonth['2026-10'],10000);
  assert.equal(result.addedByBillMonth['2026-11'],19704);
  assert.equal(state.purchaseEvents.length,5);
  assert.equal(state.cardSettlements.length,0);
  assert.ok(state.purchaseEvents.every(p=>p.card==='dカード'&&p.purchase_date.startsWith('2026-09')));
});
test('expense analytics shows only economic EXPENSE card purchases in September',()=>{
  const {state,parse,win}=sandbox();parse();
  const september=win.householdExpenseAnalyticsV106.summarize(state,'2026-09');
  assert.equal(september.rows.length,4);
  assert.equal(september.totals.NORMAL+september.totals.SPECIAL,19704);
  const october=win.householdExpenseAnalyticsV106.summarize(state,'2026-10');
  assert.equal(october.rows.length,0);
  const pasmo=state.purchaseEvents.find(x=>/PASMO/.test(x.merchant_raw));
  assert.equal(pasmo.economic_type,'TRANSFER');
  assert.equal(pasmo.original_amount,10000);
});
test('reimport is idempotent and preserves manual economic reclassification',()=>{
  const {state,parse}=sandbox();parse();
  const first=state.purchaseEvents[0];first.category='PERSONAL';first.economic_type='EXPENSE';
  const res=parse();
  assert.equal(res.added,0);assert.equal(res.duplicates,5);
  assert.equal(state.purchaseEvents.length,5);
  assert.equal(first.category,'PERSONAL');
});
test('two identical same-card charges remain two occurrences, not one',()=>{
  const {state,parse}=sandbox(),one=rows[0];const result=parse(csv([one,one]));
  assert.equal(result.added,2);
  assert.deepEqual(Array.from(state.purchaseEvents,p=>p.occurrence_index),[1,2]);
  assert.notEqual(state.purchaseEvents[0].purchase_id,state.purchaseEvents[1].purchase_id);
  const reimport=parse(csv([one,one]));
  assert.equal(reimport.added,0);assert.equal(reimport.duplicates,2);
});
test('d-card and JAL are never combined by transaction deduplication',()=>{
  const {state,parse}=sandbox();
  state.purchaseEvents.push({card:'MUFG/DC/JAL',purchase_date:'2026-09-25',
    billing_month:'2026-11',merchant_raw:'SAMPLE CAFE …',original_amount:1000});
  parse();
  assert.equal(state.purchaseEvents.length,6);
});
test('malformed row rejects before any state writes',()=>{
  const {state,parse}=sandbox();
  assert.throws(()=>parse(csv([...rows,['2026-11','2026-02-30','INVALID','88','1回払い','本人','']])),/利用日が不正/);
  assert.equal(state.purchaseEvents.length,0);
});
test('negative card refund is rejected rather than silently treated as spending',()=>{
  const {state,parse}=sandbox();
  assert.throws(()=>parse(csv([[...rows[0].slice(0,3),'-500',...rows[0].slice(4)]])),/返金行/);
  assert.equal(state.purchaseEvents.length,0);
});
test('genuine unrelated MUFG CSV is routed to the pre-existing parser',()=>{
  const {context}=sandbox();
  assert.equal(context.parseMufg({text:'確定情報,ご利用日,ご利用金額（円）'},{name:'other.csv'}).source,'ORIGINAL');
});
