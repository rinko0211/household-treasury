'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const code=fs.readFileSync('simple-expense-import-v213.js','utf8');
const css=fs.readFileSync('ui-modern-v169.css','utf8');
const html=fs.readFileSync('index.html','utf8');
const loader=fs.readFileSync('sync-state-sanitizer-v22.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');
assert.doesNotMatch(code,/function renderPreview\(/,'Per-row editable preview must be removed');
assert.doesNotMatch(code,/data-simple-field/,'No duplicate input controls on Import page');
assert.doesNotMatch(code,/scrollIntoView\(/,'File import should not jump the viewport');
assert.ok(code.includes('既存の支出ページで')||code.includes('「支出」ページで'));
assert.ok(css.includes('#simpleExpenseResultV220'));
assert.ok(css.includes('overflow-wrap:anywhere'));
assert.ok(css.includes('overflow-x:clip'));
assert.ok(html.includes('ui-modern-v169.css?v=222'));
assert.ok(html.includes('sync-state-sanitizer-v22.js?v=220'));
assert.ok(loader.includes('simple-expense-import-v213.js?v=220'));
assert.ok(sw.includes('./simple-expense-import-v213.js?v=220'));
let state={cashExpenses:[],purchaseEvents:[]},writes=0,backups=0,confirms=0,syncs=0;
const w={
 getTreasuryStateRaw:()=>state,
 confirm:()=>{confirms++;return true;},
 replaceTreasuryState:next=>{state=next;writes++;return true;},
 treasuryRecoverySnapshot:()=>{backups++;},
 cloudSyncOnLocalSave:()=>{syncs++;},
 dispatchEvent:()=>{}
};
const context={window:w,document:{readyState:'loading',addEventListener:()=>{}},
 CustomEvent:class {},structuredClone,Date,Number,String,Array,Object,Set,Map,
 RegExp,Math,Intl,JSON,Error,Promise,decodeURIComponent};
vm.createContext(context);vm.runInContext(code,context);
const api=w.householdSimpleExpenseImportV213;
assert.ok(api.importDirect,'One-step import must be accessible to tests');
const csv='利用日,店舗,金額,内容,カテゴリ,費目,支払方法,カード,備考\n'+
 '2026-11-09,川崎の店舗（店名要確認）,526,雑貨,その他,変動費,未確認,,PayPay支払い\n'+
 '2026-11-10,メゾンカイザー武蔵小杉店,475,パン,食費,変動費,未確認,,電子マネー\n'+
 '2026-11-10,ヤマト運輸,4872,配送料,その他,変動費,カード,三井住友カード,カード明細重複注意\n'+
 '2026-11-10,割り勘カード立替,9450,本人消費,その他,変動費,カード,カード未特定,総決済37800円 立替未回収28350円\n'+
 '2026-11-11,ユニクロオンライン,4990,ジャケット,その他,変動費,未確認,,注文日未確認\n';
const file={name:'%E5%AE%B6%E8%A8%88_CSV_20261109-11.csv',text:async()=>csv};
(async()=>{
 const first=await api.importDirect(file);
 assert.equal(first.read,5);
 assert.equal(first.added,5);
 assert.equal(first.review,0);
 assert.equal(writes,1);
 assert.equal(backups,1);
 assert.equal(syncs,1);
 assert.equal(confirms,1,'Exactly one overall confirmation, never one per row');
 assert.equal(state.cashExpenses.length,3);
 assert.equal(state.purchaseEvents.length,2);
 assert.equal(state.cashExpenses.reduce((x,r)=>x+r.amount,0)+state.purchaseEvents.reduce((x,r)=>x+r.original_amount,0),20313);
 assert.equal(state.purchaseEvents.find(x=>x.original_amount===9450).payment_amount,9450);
 assert.ok(!state.purchaseEvents.some(x=>x.original_amount===37800),'No fabricated card charge is created');
 const again=await api.importDirect(file);
 assert.equal(again.added,0);
 assert.equal(again.duplicates,5);
 assert.equal(writes,1,'Re-import does not alter balances');
 assert.equal(confirms,1,'No confirmation for no-op import');
 const mixed='利用日,店舗,金額,内容,カテゴリ,費目,支払方法,カード,備考\n'+
  '2026-11-11,メゾンカイザー武蔵小杉店,470,パン,食費,変動費,未確認,,類似の支出\n'+
  '2026-11-11,新規購入品,1234,食品,食費,変動費,未確認,,別の買い物\n';
 const second=await api.importDirect({name:'mixed.csv',text:async()=>mixed});
 assert.equal(second.added,1);
 assert.equal(second.review,1);
 assert.equal(second.withheld[0].amount,470);
 assert.equal(writes,2);
 assert.equal(confirms,2);
 const unknown='利用日,店舗,金額,内容,カテゴリ,費目,支払方法,カード,備考\n'+
  '2026-11-11,カード不明の買物,300,買い物,その他,変動費,カード,,カード名は後から編集\n';
 const third=await api.importDirect({name:'unknown.csv',text:async()=>unknown});
 assert.equal(third.adjusted,1);
 assert.equal(third.added,1);
 assert.equal(state.cashExpenses.at(-1).payment_method,'UNCONFIRMED');
 assert.equal(state.cashExpenses.at(-1).note,'カード名は後から編集');
 console.log('SIMPLE_EXPENSE_ONE_STEP_V220_PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
