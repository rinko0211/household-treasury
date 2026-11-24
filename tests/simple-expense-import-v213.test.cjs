'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const code=fs.readFileSync('simple-expense-import-v213.js','utf8');
let state={cashExpenses:[],purchaseEvents:[]},writes=0,backups=0,syncs=0;
const w={getTreasuryStateRaw:()=>state,confirm:()=>true,
 replaceTreasuryState:v=>{state=v;writes++;return true},
 treasuryRecoverySnapshot:()=>{backups++},cloudSyncOnLocalSave:()=>{syncs++},
 dispatchEvent:()=>{},addEventListener:()=>{}};
const context={window:w,document:{readyState:'loading',addEventListener:()=>{}},
 CustomEvent:class {},structuredClone,Date,Number,Math,Object,Map,Set,String,Array,
 RegExp,JSON,Error,Intl};
vm.createContext(context);vm.runInContext(code,context);
const a=w.householdSimpleExpenseImportV213;
assert.ok(a);
const csv='利用日,店舗,金額,内容,カテゴリ,費目,支払方法,カード,備考\n'+
 '2026-11-01,八戸液化ガス,4769,11月分ガス代,公共料金,固定費,未確認,,請求月は未確定\n';
const list=a.parse(csv);
assert.equal(list.length,1);
assert.equal(list[0].payment,'UNCONFIRMED');
assert.equal(list[0].bucket,'FIXED');
assert.equal(list[0].category,'UTILITIES');
assert.equal(a.parse('利用日,利用店名・商品名,利用金額\n2026/11/01,八戸液化ガス,4769'),null,
 'Rakuten official CSV must never be hijacked');
const initial=a.plan(state,list,'simple.csv');
assert.equal(initial.added,1);
assert.equal(initial.out[0].kind,'cash','Unknown payment is not falsely named cash or Rakuten');
assert.equal(initial.out[0].data.payment_method,'UNCONFIRMED');
assert.equal(initial.out[0].data.expense_bucket_v193,'FIXED');
assert.equal(initial.out[0].data.subcategory,'GAS');
assert.equal(state.cashExpenses.length,0,'Dry run must not modify ledger');
// User manually corrects payment type/card in the Import review.
list[0].payment='CARD';list[0].card='Rakuten';
const confirmed=a.apply(list,'simple.csv');
assert.equal(confirmed.added,1);assert.equal(confirmed.total,4769);
assert.equal(writes,1);assert.equal(backups,1);assert.equal(syncs,1);
assert.equal(state.purchaseEvents.length,1);
assert.equal(state.cashExpenses.length,0);
assert.equal(state.purchaseEvents[0].card,'Rakuten');
assert.equal(state.purchaseEvents[0].billing_month,undefined,'Must not invent billing month');
assert.equal(state.purchaseEvents[0].settlement_pending,true);
assert.equal(state.purchaseEvents[0].expense_bucket_v193,'FIXED');
assert.equal(state.purchaseEvents[0].original_amount,4769);
assert.equal(state.purchaseEvents[0].count_in_spending,true);
assert.equal(a.plan(state,list).added,0,'Repeat import is idempotent');
const repeated=a.apply(list,'renamed.csv');
assert.equal(repeated.skipped,true);
assert.equal(writes,1);
// One day off, same merchant and small mismatch: review required, not automatic merge.
const old=[{date:'2026-11-03',description:'子ども服',amount:4000,payment_method:'UNCONFIRMED',count_in_spending:true}];
const approximate={...list[0],date:'2026-11-04',merchant:'子ども服',amount:3985,key:'simple-v213:fake',card:'',payment:'UNCONFIRMED'};
const st={purchaseEvents:[],cashExpenses:old};
const found=a.hint(approximate,a.index(st));
assert.ok(found&&!found.exact);
assert.equal(a.plan(st,[approximate]).added,0,'Potential duplication is blocked before manual approval');
const independent={...approximate,force:true};
assert.equal(a.plan(st,[independent]).added,1,'Explicit distinct transaction can be imported');
const cash={...list[0],key:'simple-v213:distinct-cash',date:'2026-11-06',merchant:'駐車場',amount:400,payment:'CASH',card:'',bucket:'VARIABLE',category:'CAR'};
assert.equal(a.plan(state,[cash]).out[0].kind,'cash');
assert.throws(()=>a.plan(state,[{...cash,payment:'CARD'}]),/カード名/);
assert.equal(state.purchaseEvents.length,1,'Tests never double charge');
// 2026-11-24: DAISO and Kaneiri are separate shops, both ¥770.
const sameDayRows=a.parse('利用日,店舗,金額,内容,カテゴリ,費目,支払方法,カード,備考\n'+
'2026-11-24,ダイソー イオンモール下田店,770,包装用品,日用品,変動費,未確認,,\n'+
'2026-11-24,フルーツ＆野菜村 イオンモール下田,2038,野菜果物,食費,変動費,未確認,,\n'+
'2026-11-24,カルディコーヒーファーム イオンモール下田店,2070,コーヒー,食費,変動費,未確認,,\n'+
'2026-11-24,イオン下田店,1756,ナッツ,食費,変動費,未確認,,\n'+
'2026-11-24,niko and ... イオンモール下田店,990,プレート,日用品,変動費,未確認,,\n'+
'2026-11-24,金入 下田店,770,ねこグッズ,その他,変動費,未確認,,\n');
assert.equal(sameDayRows.length,6);
const six=a.plan({cashExpenses:[],purchaseEvents:[]},sameDayRows);
assert.equal(six.added,6,'Six different store receipts must all import, including both ¥770 payments');
assert.equal(six.warnings.length,0);
const existingDaiso=a.index({purchaseEvents:[],cashExpenses:[{date:'2026-11-24',description:'ダイソー イオンモール下田店',amount:770,count_in_spending:true}]});
assert.equal(a.hint(sameDayRows[0],existingDaiso).exact,false,'Same merchant and amount is still a duplicate candidate');
assert.equal(a.hint(sameDayRows[5],existingDaiso),null,'Different merchant with the same amount is NOT a duplicate');

console.log('SIMPLE_EXPENSE_IMPORT_V213_PASS');