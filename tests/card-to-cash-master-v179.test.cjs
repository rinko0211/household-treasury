'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const engine=fs.readFileSync('card-cash-reclass-v179.js','utf8');
const ui=fs.readFileSync('semantic-ui-v48.js','utf8');
const cycle=fs.readFileSync('card-cycle-v81.js','utf8');
const oldForecast=fs.readFileSync('card-forecast-v49.js','utf8');
const usage=fs.readFileSync('purchase-usage-ledger-v157.js','utf8');
const cashAnalytics=fs.readFileSync('cash-expense-analytics-v106.js','utf8');
const ledger=fs.readFileSync('treasury-ledger-v145.js','utf8');
const card={id:'jal-01',name:'JALカード',active:true,closingDay:15,settlementDay:10,paymentMode:'FULL'};
const data={
 masters:{cards:[card],fixedExpenses:[]},cardBillingLines:[],cardSettlements:[],cashTransactions:[],
 cashExpenses:[
 {id:'old-cash',date:'2026-10-18',description:'三弘青果',amount:800,category:'FOOD',
  payment_method:'CASH',record_kind:'CASH_EXPENSE',count_in_spending:false,
  reconciliation_status:'RECLASSIFIED_CARD_PAYMENT',card_purchase_id:'cash-to-card:v178:old-cash',
  source_file:'old-receipt.csv'}
 ],
 purchaseEvents:[
 {purchase_id:'receipt500',purchase_date:'2026-10-24',merchant_raw:'温泉売店',
  original_amount:500,card:'JALカード',card_master_id:'jal-01',billing_month:'2026-12',
  economic_type:'EXPENSE',category:'OTHER',subcategory:'OTHER',spending_class:'SPECIAL',count_in_spending:true},
 {purchase_id:'cash-to-card:v178:old-cash',purchase_date:'2026-10-18',merchant_raw:'三弘青果',
  original_amount:800,card:'JALカード',card_master_id:'jal-01',billing_month:'2026-12',
  economic_type:'EXPENSE',category:'FOOD',subcategory:'GROCERIES',spending_class:'NORMAL',
  source_cash_expense_id:'old-cash',count_in_spending:true}
 ],
 automationRules:[],reviewQueue:[]
};
let st=JSON.parse(JSON.stringify(data));
const fields=new Map(),calls=[],confirmations=[],alerts=[],tasks=[];
class Fake {
 constructor(id=''){this.id=id;this.dataset={};this.events={};this.style={};this.value='';
  this.disabled=false;this._html='';this.next={style:{}};this.remember={style:{}};
  this.classList={contains:()=>false};}
 set innerHTML(value){this._html=String(value);for(const m of this._html.matchAll(/id="([^"]+)"/g))
  if(!fields.has(m[1]))fields.set(m[1],new Fake(m[1]));}
 get innerHTML(){return this._html}
 set textContent(x){this._text=String(x)}
 get textContent(){return this._text||''}
 addEventListener(name,cb){this.events[name]=cb}
 querySelector(q){if(q==='[data-v108-tx-next]')return this.next;
  if(q==='[data-v108-tx-remember]')return this.remember;return null}
 click(q){this.events.click?.({target:{closest:s=>s===q?{dataset:{}}:null}})}
}
const document={readyState:'loading',body:{appendChild:x=>fields.set(x.id,x)},
 createElement:()=>new Fake(),getElementById:id=>fields.get(id)||null,
 addEventListener:()=>{},querySelector:()=>null};
const window={
 getTreasuryStateRaw:()=>st,addEventListener:()=>{},requestAnimationFrame:()=>{},
 householdSemanticV47:{CATEGORY_DEFS:{FOOD:{label:'食費',subs:['GROCERIES','OTHER']},
  OTHER:{label:'その他',subs:['OTHER']}},migrateState:()=>{},applyAutomationRules:()=>{}},
 householdExpenseUnifiedV148:{captureEditContext:()=>null,render:()=>{}},
 householdPlanningV79:{baselineOf:()=>0,forecastMode:()=> 'COMPONENTS'},
 treasuryRecoverySnapshot:reason=>calls.push({type:'backup',reason,snapshot:JSON.parse(JSON.stringify(st))}),
 replaceTreasuryState:next=>{st=JSON.parse(JSON.stringify(next));calls.push({type:'save'});return true},
 repairTreasuryBankBalances:()=>calls.push({type:'repair'}),
 setTreasurySaveStatus:()=>{},cloudSyncOnLocalSave:()=>calls.push({type:'sync'}),
 renderDashboardV39:()=>{},reconcileRakutenBillingV56:()=>{},
 alert:msg=>alerts.push(msg),
 confirm:msg=>{confirmations.push(msg);return confirmations.length!==1}
};
const context={window,document,Intl,Date,Number,String,Array,Set,Map,Math,JSON,Error,
 alert:window.alert,structuredClone:x=>JSON.parse(JSON.stringify(x)),
 setTimeout:f=>tasks.push(f),crypto:{randomUUID:()=> 'id-123'}};
vm.runInNewContext(cycle,context);
vm.runInNewContext(engine,context);
vm.runInNewContext(ui,context);
const api=window.householdCardCashReclassV179;
assert.equal(typeof api.plan,'function');
const req=(id,date,description,amount,category='OTHER')=>({
 id,date,description,amount,economicType:'EXPENSE',
 spendingClass:category==='FOOD'?'NORMAL':'SPECIAL',category,
 subcategory:category==='FOOD'?'GROCERIES':'OTHER',costNature:'VARIABLE'});
const amountTotal=x=>
 (x.cashExpenses||[]).filter(o=>o.count_in_spending!==false).reduce((n,o)=>n+Number(o.amount||0),0)+
 (x.purchaseEvents||[]).filter(o=>o.count_in_spending!==false).reduce((n,o)=>n+Number(o.original_amount||0),0);
const total=amountTotal(st);
assert.equal(total,1300);
const plan=api.plan(st,req('receipt500','2026-10-24','温泉売店',500));
assert.equal(amountTotal(plan.next),total,'Expense totals unchanged on card -> cash');
assert.equal(plan.cash.amount,500);
assert.equal(plan.cash.payment_method,'CASH');
assert.equal(plan.cash.category,'OTHER');
assert.equal(plan.cash.spending_class,'SPECIAL');
assert.equal(plan.cash.source_purchase_id,'receipt500');
assert.equal(plan.cash.id,'card-to-cash:v179:receipt500');
assert.equal(plan.original.count_in_spending,false);
assert.equal(plan.original.reconciliation_status,'RECLASSIFIED_CASH_PAYMENT');
assert.equal(plan.original.cash_expense_id,plan.cash.id);
assert.equal(st.purchaseEvents[0].count_in_spending,true,'Plan never mutates original');
assert.deepEqual(JSON.stringify(plan.next.cashTransactions),JSON.stringify(st.cashTransactions));
assert.throws(()=>api.plan(plan.next,req('receipt500','2026-10-24','温泉売店',500)),/修正済み/,'Cannot convert twice');
const back=api.plan(st,req('cash-to-card:v178:old-cash','2026-10-18','三弘青果',800,'FOOD'));
assert.equal(back.restored,true);
assert.equal(back.next.cashExpenses.length,1,'Existing cash row must be revived, never copied');
assert.equal(back.cash.id,'old-cash');
assert.equal(back.cash.source_file,'old-receipt.csv');
assert.equal(back.cash.count_in_spending,true);
assert.equal(back.cash.payment_method,'CASH');
assert.equal(back.cash.card_purchase_id,undefined);
assert.equal(back.cash.reconciliation_status,undefined);
assert.equal(back.next.purchaseEvents[1].count_in_spending,false);
assert.equal(amountTotal(back.next),total);
assert.throws(()=>api.plan(back.next,req('cash-to-card:v178:old-cash','2026-10-18','三弘青果',800,'FOOD')),/修正済み/);
const duplicate=JSON.parse(JSON.stringify(st));
duplicate.cashExpenses.push({id:'already',date:'2026-10-24',amount:500,description:'温泉売店',count_in_spending:true});
assert.throws(()=>api.plan(duplicate,req('receipt500','2026-10-24','温泉売店',500)),/すでにあります/);
const rejects=[
 {mdc_import_v144:true}, {pdf_card_identity:'JAL#1'},
 {source_file:'2026-12.pdf'}, {billing_month_source:'STATEMENT'},
 {settlement_id:'settled1'}, {installment_count:3},
 {reconciliation_status:'ABSORBED_DUPLICATE',count_in_spending:false}
];
for(const patch of rejects){
 const modified=JSON.parse(JSON.stringify(st));Object.assign(modified.purchaseEvents[0],patch);
 assert.throws(()=>api.plan(modified,req('receipt500','2026-10-24','温泉売店',500)),/できません|修正済み/,
 'Authoritative statement or installment must not be turned into cash');
}
const linked=JSON.parse(JSON.stringify(st));
linked.cardBillingLines=[{purchase_id:'receipt500',purchase_date:'2026-10-24',
 original_amount:500,merchant_raw:'温泉売店',card:'JALカード'}];
assert.throws(()=>api.plan(linked,req('receipt500','2026-10-24','温泉売店',500)),/確定したカード明細/);
assert.throws(()=>api.plan(st,req('receipt500','not-a-date','温泉売店',500)),/利用日/);
assert.throws(()=>api.plan(st,req('receipt500','2026-10-24','温泉売店',0)),/利用日/);
const before=window.householdCardCycleV81.buildPlan(400);
assert.ok(before.rows.some(x=>x.card==='JALカード'&&x.billing_month==='2026-12'&&x.known_purchase_total===1300));
assert.ok(usage.includes("r.count_in_spending!==false")||usage.includes("count_in_spending!==false"));
assert.ok(cashAnalytics.includes("p.count_in_spending===false"));
assert.ok(ledger.includes("b.count_in_spending===false"));
assert.ok(ui.includes("'RECLASSIFIED_CASH_PAYMENT'"),'UI must hide archived card events');
const readOnlyChecks=()=>{const cols=st.cashExpenses.filter(x=>x.count_in_spending!==false).length;
 assert.equal(cols,0,'Archived original not counted before conversion')};
readOnlyChecks();
// Purchase editor: select cash, preview, cancel, then confirm.
window.openSemanticTransactionEditorV108('purchase','receipt500');
const semanticModal=fields.get('transactionEditorV108');
assert.ok(fields.get('transactionEditorRawV110').innerHTML.includes('現金払いに変更'));
fields.get('transactionEditorEconV108').value='EXPENSE';
fields.get('transactionEditorSpendV108').value='SPECIAL';
fields.get('transactionEditorCatV108').value='OTHER';
fields.get('transactionEditorSubV108').value='OTHER';
fields.get('transactionEditorNatureV159').value='VARIABLE';
fields.get('transactionCardMasterV176').value='__CASH__';
semanticModal.click('[data-v108-tx-save]');
assert.equal(confirmations.length,1);
assert.equal(st.cashExpenses.length,1);
assert.equal(calls.length,0,'Cancelled conversion has no side effects');
semanticModal.click('[data-v108-tx-save]');
assert.equal(st.cashExpenses.length,2);
assert.equal(st.purchaseEvents[0].count_in_spending,false);
assert.equal(st.cashExpenses[1].payment_method,'CASH');
assert.equal(st.cashExpenses[1].amount,500);
assert.equal(amountTotal(st),total);
assert.equal(calls[0].type,'backup');
assert.equal(calls[0].snapshot.purchaseEvents[0].count_in_spending,true,'Recovery snapshot before any replacement');
assert.equal(calls.filter(x=>x.type==='save').length,1);
assert.equal(semanticModal.style.display,'none');
const after=window.householdCardCycleV81.buildPlan(400);
assert.ok(after.rows.some(x=>x.card==='JALカード'&&x.billing_month==='2026-12'&&x.known_purchase_total===800),
 'Card forecast excludes archived 500 purchase but keeps remaining 800');
// Integrated editor: restore the source cash rather than duplicate it.
window.openIntegratedCardEditorV114('purchase','cash-to-card:v178:old-cash');
const cardModal=fields.get('transactionCardEditorV114');
assert.ok(fields.get('transactionCardEditorBodyV114').innerHTML.includes('現金払いに変更'));
fields.get('v114Card').value='__CASH__';
fields.get('v114Date').value='2026-10-18';
fields.get('v114Merchant').value='三弘青果';
fields.get('v114Amount').value='800';
cardModal.events.change({target:{id:'v114Card'}});
assert.equal(fields.get('v114MonthField').style.display,'none','Cash option hides irrelevant billing-month input');
assert.ok(fields.get('v114MonthHint').textContent.includes('現金支出へ移します'));
cardModal.click('[data-v114-card-save]');
assert.equal(st.cashExpenses.length,2,'Cash -> card -> cash reuses prior original');
assert.equal(st.cashExpenses[0].id,'old-cash');
assert.equal(st.cashExpenses[0].count_in_spending,true);
assert.equal(st.purchaseEvents[1].count_in_spending,false);
assert.equal(amountTotal(st),total);
assert.equal(calls.filter(x=>x.type==='save').length,2);
assert.equal(cardModal.style.display,'none');
const finalForecast=window.householdCardCycleV81.buildPlan(400);
assert.ok(!finalForecast.rows.some(x=>x.card==='JALカード'&&x.billing_month==='2026-12'&&x.known_purchase_total>0),
 'Cash conversions must not contribute to JAL known purchases');
assert.ok(oldForecast.includes("!['ABSORBED_DUPLICATE','RECLASSIFIED_CASH_PAYMENT']"),
 'Older card forecast also ignores reversed records');
console.log('CARD_TO_CASH_MASTER_V179_PASS');