'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const engineSource=fs.readFileSync('cash-card-reclass-v178.js','utf8');
const uiSource=fs.readFileSync('semantic-ui-v48.js','utf8');
const cycleSource=fs.readFileSync('card-cycle-v81.js','utf8');
const analytics=fs.readFileSync('cash-expense-analytics-v106.js','utf8');
const ledger=fs.readFileSync('treasury-ledger-v145.js','utf8');
const cards=[
 {id:'card-jal',name:'JALカード',active:true,closingDay:15,settlementDay:10},
 {id:'card-rakuten',name:'楽天カード',active:true,closingDay:31,settlementDay:27},
 {id:'card-d',name:'dカード',active:true,settlementDay:10}
];
let state={
 masters:{cards,fixedExpenses:[]},
 cashExpenses:[
  {id:'cash800',date:'2026-10-18',description:'三弘青果',amount:800,payment_method:'CASH',
   record_kind:'CASH_EXPENSE',economic_type:'EXPENSE',spending_class:'NORMAL',
   category:'FOOD',subcategory:'GROCERIES',source_file:'legacy.csv',note:'りんご',
   count_in_spending:true},
  {id:'cash500',date:'2026-10-20',description:'屋台',amount:500,payment_method:'CASH',
   economic_type:'EXPENSE',spending_class:'NORMAL',category:'FOOD',subcategory:'EATING_OUT'},
  {id:'cashMirror',date:'2026-10-23',description:'既存カード品',amount:2207,
   economic_type:'EXPENSE',spending_class:'NORMAL',category:'OTHER',subcategory:'OTHER'}
 ],
 purchaseEvents:[
  {purchase_id:'existing',purchase_date:'2026-10-23',merchant_raw:'既存カード品',
   original_amount:2207,card:'JALカード',card_master_id:'card-jal',billing_month:'2026-12',
   economic_type:'EXPENSE',category:'OTHER',subcategory:'OTHER'}
 ],
 cashTransactions:[{id:'bank1',date:'2026-10-18',description_raw:'口座振替',amount:-7000}],
 cardBillingLines:[],cardSettlements:[],reviewQueue:[],automationRules:[]
};
const fields=new Map(),calls=[],alerts=[],tasks=[],confirmation=[];
class Fake{
 constructor(id=''){this.id=id;this.dataset={};this.events={};this.style={};this.value='';
  this.disabled=false;this._html='';this.next={style:{}};this.remember={style:{}};this.classList={contains:()=>false}}
 set innerHTML(s){
  this._html=String(s);
  for(const m of this._html.matchAll(/id="([^"]+)"/g))
   if(!fields.has(m[1]))fields.set(m[1],new Fake(m[1]));
 }
 get innerHTML(){return this._html}
 set textContent(v){this._text=String(v)}
 get textContent(){return this._text||''}
 addEventListener(k,fn){this.events[k]=fn}
 querySelector(s){if(s==='[data-v108-tx-next]')return this.next;if(s==='[data-v108-tx-remember]')return this.remember;return null}
 click(selector){this.events.click?.({target:{closest:s=>s===selector?{dataset:{}}:null}})}
}
const document={readyState:'loading',body:{appendChild:el=>fields.set(el.id,el)},
 createElement:()=>new Fake(),getElementById:id=>fields.get(id)||null,
 addEventListener:()=>{},querySelector:()=>null};
const window={
 getTreasuryStateRaw:()=>state,addEventListener:()=>{},requestAnimationFrame:()=>{},
 householdSemanticV47:{
  CATEGORY_DEFS:{FOOD:{label:'食費',subs:['GROCERIES','OTHER']},OTHER:{label:'その他',subs:['OTHER']}},
  migrateState:()=>{},applyAutomationRules:()=>{}
 },
 householdExpenseUnifiedV148:{captureEditContext:()=>null,render:()=>{}},
 householdPlanningV79:{baselineOf:()=>0,forecastMode:()=> 'COMPONENTS'},
 treasuryRecoverySnapshot:(reason)=>{calls.push({type:'backup',reason,cashCounted:state.cashExpenses[0].count_in_spending,
  purchaseCount:state.purchaseEvents.length})},
 replaceTreasuryState:next=>{state=JSON.parse(JSON.stringify(next));calls.push({type:'save'});return true},
 repairTreasuryBankBalances:()=>calls.push({type:'repair'}),
 setTreasurySaveStatus:()=>{},cloudSyncOnLocalSave:()=>calls.push({type:'sync'}),
 renderDashboardV39:()=>{},
 confirm:msg=>{confirmation.push(msg);return confirmation.length>1},
 alert:msg=>alerts.push(msg)
};
const globals={window,document,Date,Intl,Number,String,Array,Set,Map,Math,JSON,Error,
 structuredClone:v=>JSON.parse(JSON.stringify(v)),setTimeout:fn=>tasks.push(fn),
 crypto:{randomUUID:()=> 'random-id'},alert:window.alert};
vm.runInNewContext(cycleSource,globals);
vm.runInNewContext(engineSource,globals);
vm.runInNewContext(uiSource,globals);
const api=window.householdCashCardReclassV178;
assert.equal(typeof api.plan,'function');
const input=id=>({id,cardMasterId:'card-jal',date:'2026-10-18',
 description:'三弘青果',amount:800,economicType:'EXPENSE',
 spendingClass:'NORMAL',category:'FOOD',subcategory:'GROCERIES',costNature:'VARIABLE'});
const draft=api.plan(state,input('cash800'));
assert.equal(draft.purchase.billing_month,'2026-12');
assert.equal(draft.purchase.expected_settlement_date,'2026-12-10');
assert.equal(draft.purchase.card_master_id,'card-jal');
assert.equal(draft.purchase.original_amount,800);
assert.equal(draft.purchase.cost_nature,'VARIABLE');
assert.equal(draft.next.cashExpenses[0].count_in_spending,false);
assert.equal(state.cashExpenses[0].count_in_spending,true,'Planning must not mutate source');
assert.equal(draft.next.cashExpenses[0].amount,800,'Original record preserved for audit');
assert.equal(draft.purchase.note,'りんご');
assert.equal(draft.purchase.source_cash_expense_id,'cash800');
assert.deepEqual(JSON.stringify(draft.next.cashTransactions),JSON.stringify(state.cashTransactions),'Bank raw records are not rewritten');
assert.throws(()=>api.plan(draft.next,input('cash800')),/修正済み/,'Same source cannot convert twice');
assert.throws(()=>api.plan(state,{...input('cash800'),cardMasterId:'card-d'}),/締め日/);
assert.throws(()=>api.plan(state,{...input('cash800'),economicType:'TRANSFER'}),/支出だけ/);
assert.throws(()=>api.plan(state,{...input('cash800'),amount:0}),/利用日・内容・金額/);
assert.throws(()=>api.plan(state,{...input('cash800'),cardMasterId:'unknown'}),/カードマスター/);
assert.throws(()=>api.plan(state,{...input('cashMirror'),date:'2026-10-23',description:'既存カード品',amount:2207}),/同日・同額・同店舗/,
 'Existing same purchase must block duplicate card insertion');
const indexless={...state,cashExpenses:[{date:'2026-10-20',description:'現金IDなし',amount:500,
 economic_type:'EXPENSE',spending_class:'NORMAL',category:'OTHER'}],purchaseEvents:[]};
const m=api.plan(indexless,{...input('cash-expense:0'),date:'2026-10-20',description:'現金IDなし',amount:500,category:'OTHER'});
assert.equal(m.next.cashExpenses[0].id,'cash-expense:0');
assert.equal(m.purchase.source_cash_expense_id,'cash-expense:0');
assert.ok(analytics.includes("c.count_in_spending===false"),'Cash analytics must exclude retired records');
assert.ok(analytics.includes("p.count_in_spending===false"),'Cash analytics must exclude absorbed purchase rows');
assert.ok(ledger.includes("c.count_in_spending===false"),'Economic ledger must exclude retired cash');
assert.ok(uiSource.includes("o.reconciliation_status==='RECLASSIFIED_CARD_PAYMENT'"),'Transaction screen must hide retired cash');
const open=window.openSemanticTransactionEditorV108;
open('cash_expense','cash800');
const modal=fields.get('transactionEditorV108');
const picker=fields.get('transactionCashCardMasterV178');
assert.ok(picker,'Cash edit form must provide registered card choices');
assert.ok(fields.get('transactionEditorRawV110').innerHTML.includes('現金のまま'));
for(const [id,value] of [
 ['transactionRawDateV110','2026-10-18'],
 ['transactionRawNameV110','三弘青果'],
 ['transactionRawAmountV110','800'],
 ['transactionEditorCatV108','FOOD'],
 ['transactionEditorSubV108','GROCERIES'],
 ['transactionEditorNatureV159','VARIABLE'],
 ['transactionCashCardMasterV178','card-jal']
])fields.get(id).value=value;
fields.get('transactionEditorRawV110').events.change({target:{id:'transactionCashCardMasterV178'}});
assert.ok(fields.get('transactionCashCardHintV178').textContent.includes('2026-12'),'Billing-month preview must come from actual card cycle');
modal.click('[data-v108-tx-save]');
assert.equal(confirmation.length,1);
assert.equal(state.purchaseEvents.length,1,'Cancel must not create a purchase');
assert.equal(state.cashExpenses[0].count_in_spending,true);
assert.equal(calls.length,0,'No backup/save needed on cancel');
modal.click('[data-v108-tx-save]');
assert.equal(confirmation.length,2);
assert.equal(state.purchaseEvents.length,2);
assert.equal(state.purchaseEvents[1].billing_month,'2026-12');
assert.equal(state.purchaseEvents[1].card_master_id,'card-jal');
assert.equal(state.cashExpenses[0].count_in_spending,false);
assert.equal(state.cashExpenses[0].reconciliation_status,'RECLASSIFIED_CARD_PAYMENT');
assert.equal(state.cashExpenses[0].card_purchase_id,state.purchaseEvents[1].purchase_id);
assert.equal(state.cashExpenses[1].count_in_spending,undefined,'Unchanged cash receipts remain counted');
assert.equal(state.cashTransactions[0].amount,-7000);
assert.equal(calls[0].type,'backup','Backup created before replacing state');
assert.equal(calls[0].cashCounted,true,'Backup must capture ORIGINAL cash state');
assert.equal(calls[0].purchaseCount,1,'Backup must capture original purchase count');
assert.equal(calls.filter(x=>x.type==='save').length,1,'Conversion persists exactly once');
const spend=(state.cashExpenses||[]).filter(x=>x.count_in_spending!==false).reduce((a,x)=>a+x.amount,0)+
 state.purchaseEvents.filter(x=>x.count_in_spending!==false).reduce((a,x)=>a+x.original_amount,0);
assert.equal(spend,800+500+2207,'Moving cash -> card must preserve combined spending total');
const forecast=window.householdCardCycleV81.buildPlan(400);
assert.ok(forecast.rows.some(x=>x.card==='JALカード'&&x.billing_month==='2026-12'&&x.known_purchase_total===3007),
 'Converted 800 yen must join JAL December purchase forecast');
assert.equal(modal.style.display,'none','Conversion closes the editor');
console.log('CASH_TO_CARD_MASTER_V178_PASS');