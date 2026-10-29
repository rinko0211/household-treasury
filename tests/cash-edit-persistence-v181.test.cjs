'use strict';
// v181: real edit->save->readback path for imported cashExpenses.
// In particular, a second save during the first transaction's save tick
// must NOT silently disappear or close the editor.
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const script=fs.readFileSync('semantic-ui-v48.js','utf8');
const app=fs.readFileSync('app.js','utf8');
let stored={
 cashExpenses:[
  {id:'cash-a',date:'2026-10-29',description:'パン屋さん',amount:1000,
   economic_type:'EXPENSE',spending_class:'NORMAL',category:'FOOD',subcategory:'GROCERIES'},
  {id:'cash-b',date:'2026-10-28',description:'幼稚園の一時預かり',amount:3400,
   economic_type:'EXPENSE',spending_class:'NORMAL',category:'CHILD',subcategory:'CHILDCARE'}
 ],
 purchaseEvents:[],cashTransactions:[],cardSettlements:[],cardBillingLines:[],
 masters:{cards:[],fixedExpenses:[]},automationRules:[],reviewQueue:[]
};
const tasks=[],alerts=[],saves=[],statuses=[];
const clone=obj=>JSON.parse(JSON.stringify(obj));
class Fake{
 constructor(id=''){this.id=id;this.value='';this.dataset={};this.events={};this.style={};
  this._html='';this.children=[];this.classList={contains:()=>false};this.next={style:{}};
  this.remember={style:{}};}
 set innerHTML(s){
  this._html=String(s);
  for(const match of this._html.matchAll(/id="([^"]+)"/g))
   if(!elements.has(match[1]))elements.set(match[1],new Fake(match[1]));
 }
 get innerHTML(){return this._html;}
 set textContent(v){this._text=String(v)}
 get textContent(){return this._text||''}
 addEventListener(name,fn){this.events[name]=fn}
 querySelector(query){
  if(query==='[data-v108-tx-next]')return this.next;
  if(query==='[data-v108-tx-remember]')return this.remember;
  return null;
 }
 click(selector){this.events.click?.({target:{closest:q=>q===selector?{dataset:{}}:null}})}
}
const elements=new Map();
const document={
 readyState:'loading',body:{appendChild:m=>elements.set(m.id,m)},
 createElement:()=>new Fake(),
 getElementById:id=>elements.get(id)||null,addEventListener:()=>{},
 querySelector:()=>null
};
const win={
 getTreasuryStateRaw:()=>clone(stored),addEventListener:()=>{},requestAnimationFrame:()=>{},
 householdSemanticV47:{CATEGORY_DEFS:{
  FOOD:{label:'食費',subs:['GROCERIES','OTHER']},
  CHILD:{label:'子育て',subs:['CHILDCARE','OTHER']},
  OTHER:{label:'その他',subs:['OTHER']}
 },migrateState:()=>{},applyAutomationRules:()=>{}},
 householdExpenseUnifiedV148:{captureEditContext:()=>null,render:()=>{}},
 treasuryRecoverySnapshot:reason=>statuses.push(['backup',reason]),
 replaceTreasuryState:next=>{
  const same=JSON.stringify(stored)===JSON.stringify(next);
  if(same)return false;
  stored=clone(next);saves.push(clone(stored));return true;
 },
 repairTreasuryBankBalances:()=>{},cloudSyncOnLocalSave:()=>{},
 setTreasurySaveStatus:status=>statuses.push(['status',status]),
 alert:msg=>alerts.push(String(msg)),confirm:()=>true,
 renderDashboardV39:()=>{},
};
const globals={window:win,document,Date,Intl,JSON,Number,String,Set,Array,Map,
 structuredClone:clone,Math,Error,crypto:{randomUUID:()=> 'generated'},
 setTimeout:f=>tasks.push(f),alert:win.alert};
vm.runInNewContext(script,globals);
const open=win.openSemanticTransactionEditorV108;
assert.equal(typeof open,'function');
function openAndFill(id,{date,name,amount,cat,sub}){
 open('cash_expense',id);
 const modal=elements.get('transactionEditorV108');
 assert.ok(modal&&modal.style.display==='block','Edit dialog opens');
 assert.ok(elements.get('transactionEditorRawV110').innerHTML.includes('transactionRawAmountV110'));
 elements.get('transactionRawDateV110').value=date;
 elements.get('transactionRawNameV110').value=name;
 elements.get('transactionRawAmountV110').value=String(amount);
 elements.get('transactionEditorEconV108').value='EXPENSE';
 elements.get('transactionEditorSpendV108').value='NORMAL';
 elements.get('transactionEditorCatV108').value=cat;
 elements.get('transactionEditorSubV108').value=sub;
 elements.get('transactionEditorNatureV159').value='VARIABLE';
 elements.get('transactionCashCardMasterV178').value='';
 return modal;
}
// Store the new amount and updated category from the real imported cash editor.
let modal=openAndFill('cash-a',{date:'2026-10-29',name:'パン屋さん',amount:1200,cat:'FOOD',sub:'GROCERIES'});
modal.click('[data-v108-tx-save]');
assert.equal(stored.cashExpenses[0].amount,1200,'First cash expense persisted');
assert.equal(stored.cashExpenses[0].payment_method,undefined,'No new card record was created');
assert.equal(stored.cashExpenses[0].cost_nature,'VARIABLE');
assert.equal(stored.purchaseEvents.length,0);
assert.equal(modal.style.display,'none');
assert.equal(saves.length,1);
// Editing another cash transaction in the same tick previously closed the modal
// without saving, since persist() quietly returned when busy.
modal=openAndFill('cash-b',{date:'2026-10-28',name:'幼稚園預かり',amount:3500,cat:'CHILD',sub:'CHILDCARE'});
modal.click('[data-v108-tx-save]');
assert.equal(stored.cashExpenses[1].amount,3400,'Do not write during existing save');
assert.equal(modal.style.display,'block','Failed save MUST keep the editor open');
assert.ok(alerts.some(x=>x.includes('直前の保存を処理中')));
assert.equal(saves.length,1);
// Trigger the delayed unlock after event-loop task boundary (do not run unrelated timers).
const busyIndex=tasks.findIndex(x=>String(x).includes('busy=false'));
assert.ok(busyIndex>=0);
tasks.splice(busyIndex,1)[0]();
modal.click('[data-v108-tx-save]');
assert.equal(stored.cashExpenses[1].amount,3500,'Retry saves the second cash expense');
assert.equal(stored.cashExpenses[1].description,'幼稚園預かり');
assert.equal(stored.cashExpenses[1].category,'CHILD');
assert.equal(modal.style.display,'none');
assert.equal(saves.length,2);
assert.equal(stored.cashExpenses.length,2);
assert.equal(stored.purchaseEvents.length,0);
// A semantic no-op (replaceTreasuryState returns false) is not a storage error.
const secondUnlock=tasks.findIndex(x=>String(x).includes('busy=false'));
assert.ok(secondUnlock>=0);tasks.splice(secondUnlock,1)[0]();
win.replaceTreasuryState=()=>false;
modal=openAndFill('cash-b',{date:'2026-10-28',name:'幼稚園預かり',amount:3500,cat:'CHILD',sub:'CHILDCARE'});
modal.click('[data-v108-tx-save]');
assert.equal(modal.style.display,'none','A no-op save may close normally');
assert.equal(saves.length,2);
assert.ok(statuses.some(x=>x[1]==='変更なし・保存済み'));
// Check the app's actual replace function: failed storage writes roll back
// the in-memory state instead of creating a phantom save.
const code=(app.match(/window\.replaceTreasuryState=n=>\{[\s\S]*?\n\};/)||[])[0];
assert.ok(code,'Main app replacement implementation should exist');
const prior={cashExpenses:[{id:'old',amount:10}]};
const box={
 window:{setTreasurySaveStatus:msg=>statuses.push(['write-error',msg])},
 structuredClone:clone,JSON,
 localStorage:{setItem:()=>{throw Error('QuotaExceededError')}},
 KEY:'householdTreasuryMVP',state:clone(prior),
 treasurySemanticComparable:o=>JSON.stringify(o),
 normalize:()=>{},injectUi:()=>{},render:()=>{},
};
const sandbox=vm.createContext(box);
vm.runInContext('var state='+JSON.stringify(prior)+';\n'+code,sandbox);
assert.throws(()=>vm.runInContext("window.replaceTreasuryState({cashExpenses:[{id:'new',amount:20}]})",sandbox),
 /QuotaExceededError/);
assert.equal(JSON.stringify(sandbox.state),JSON.stringify(prior),
 'Storage failure rolls back in-memory state');
assert.ok(statuses.some(x=>x[0]==='write-error'),'Storage failures must show status');
console.log('CASH_EDIT_PERSISTENCE_V181_PASS');