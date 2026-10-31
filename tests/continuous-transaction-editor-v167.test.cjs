'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('semantic-ui-v48.js','utf8');
let records={
 purchaseEvents:[
  {purchase_id:'first',merchant_raw:'最初の食品購入',purchase_date:'2026-10-20',
   original_amount:1400,card:'JAL',economic_type:'EXPENSE',spending_class:'NORMAL',category:'FOOD',subcategory:'GROCERIES'},
  {purchase_id:'second',merchant_raw:'次の食品購入',purchase_date:'2026-10-20',
   original_amount:1200,card:'JAL',economic_type:'EXPENSE',spending_class:'NORMAL',category:'FOOD',subcategory:'GROCERIES'}
 ],
 cashTransactions:[],cashExpenses:[],automationRules:[],reviewQueue:[]
};
const fields=new Map(),scheduled=[],events=[],saves=[],listeners={};
class Fake {
 constructor(id){this.id=id;this.style={};this.dataset={};this.value='';this.disabled=false;
  this.events={};this._html='';this.nextButton={style:{}};this.rememberButton={style:{}}}
 set innerHTML(s){this._html=String(s);
  for(const m of this._html.matchAll(/id="([^"]+)"/g))
    if(!fields.has(m[1]))fields.set(m[1],new Fake(m[1]))}
 get innerHTML(){return this._html}
 addEventListener(type,fn){this.events[type]=fn}
 querySelector(selector){
  if(selector==='[data-v108-tx-next]')return this.nextButton;
  if(selector==='[data-v108-tx-remember]')return this.rememberButton;
  return null
 }
 click(selector){this.events.click?.({target:{closest:s=>s===selector?{dataset:{}}:null}})}
}
const body={appendChild:el=>{fields.set(el.id,el)}};
const document={
 readyState:'loading',body,addEventListener:(type,fn)=>{listeners[type]=fn},
 getElementById:id=>fields.get(id)||null,createElement:type=>new Fake(type)
};
const window={
 addEventListener:()=>{},getTreasuryStateRaw:()=>records,requestAnimationFrame:fn=>scheduled.push(fn),
 householdSemanticV47:{CATEGORY_DEFS:{
  FOOD:{label:'食費',subs:['GROCERIES','OTHER']},
  DAILY_GOODS:{label:'日用品',subs:['CLOTHING','OTHER']},
  OTHER:{label:'その他',subs:['OTHER']}
 }},
 householdExpenseUnifiedV148:{
  captureEditContext:(kind,id)=>({source:'expenses',scrollY:610,
    next:id==='first'?{kind:'purchase',id:'second'}:null}),
  restoreEditContext:ctx=>events.push(['restore',ctx.scrollY]),
  render:()=>events.push(['render'])
 },
 treasuryRecoverySnapshot:msg=>events.push(['backup',msg]),
 replaceTreasuryState:st=>{records=JSON.parse(JSON.stringify(st));saves.push('save');return true},
 repairTreasuryBankBalances:()=>{},setTreasurySaveStatus:()=>{},cloudSyncOnLocalSave:()=>events.push(['sync']),
 renderDashboardV39:()=>{}
};
vm.runInNewContext(source,{window,document,Intl,Date,Number,String,Array,Set,Map,Math,JSON,Error,
 structuredClone:x=>JSON.parse(JSON.stringify(x)),setTimeout:fn=>scheduled.push(fn),crypto:{randomUUID:()=>''}});
const open=window.openSemanticTransactionEditorV108;
assert.equal(typeof open,'function');
open('purchase','first');
const modal=fields.get('transactionEditorV108');
assert.equal(modal.dataset.id,'first');
assert.equal(modal.nextButton.style.display,'','Next action visible when there is another row');
fields.get('transactionEditorCatV108').value='DAILY_GOODS';
fields.get('transactionEditorSubV108').value='CLOTHING';
modal.click('[data-v108-tx-next]');
assert.equal(records.purchaseEvents[0].category,'DAILY_GOODS');
assert.equal(records.purchaseEvents[0].subcategory,'CLOTHING');
assert.equal(records.purchaseEvents[0].original_amount,1400,'Amount unchanged by category edit');
assert.equal(records.purchaseEvents.length,2,'No transaction created');
assert.equal(modal.dataset.id,'second','Save-and-next opens next original row directly');
assert.equal(modal.style.display,'block','Modal stays in edit flow');
assert.equal(modal.nextButton.style.display,'none','Last row does not offer misleading next action');
// Emulate the browser's next task before the user taps Save again.
scheduled.shift()?.();
assert.equal(events.filter(x=>x[0]==='backup').length,1,'Recovery snapshot before save');
assert.ok(events.some(x=>x[0]==='restore'&&x[1]===610),'Scroll/context restored after first save');
fields.get('transactionEditorCatV108').value='FOOD';
fields.get('transactionEditorSubV108').value='GROCERIES';
modal.click('[data-v108-tx-save]');
assert.equal(records.purchaseEvents[1].category,'FOOD');
assert.equal(modal.style.display,'none','Ordinary save closes only editor');
assert.equal(saves.length,2,'One persisted change per save');
assert.ok(events.filter(x=>x[0]==='restore').length>=2,'Ordinary save also restores list position');
// v193: same transaction editor now supports personal pink expense owner
// allocation without changing the actual card purchase or receipt identity.
open('purchase','first');
assert.ok(modal.innerHTML.includes('value="PERSONAL"'),'Personal appears beside fixed and variable');
assert.ok(modal.innerHTML.includes('transactionEditorPersonalOwnerV193'),
  'Wife/self owner picker exists in the same expense editor');
fields.get('transactionEditorNatureV159').value='PERSONAL';
fields.get('transactionEditorPersonalOwnerV193').value='self';
modal.click('[data-v108-tx-save]');
assert.equal(records.purchaseEvents[0].expense_bucket_v193,'PERSONAL');
assert.equal(records.purchaseEvents[0].personal_owner_v193,'self');
assert.equal(records.purchaseEvents[0].original_amount,1400);
assert.equal(records.purchaseEvents[0].purchase_id,'first','Card source identity kept');
open('purchase','second');
fields.get('transactionEditorNatureV159').value='PERSONAL';
fields.get('transactionEditorPersonalOwnerV193').value='wife';
modal.click('[data-v108-tx-save]');
assert.equal(records.purchaseEvents[1].personal_owner_v193,'wife');
assert.equal(records.purchaseEvents[1].expense_bucket_v193,'PERSONAL');
open('purchase','first');
assert.equal(fields.get('transactionEditorNatureV159').value,'PERSONAL',
 'Personal option persists after reopening');
assert.equal(fields.get('transactionEditorPersonalOwnerV193').value,'self');
fields.get('transactionEditorNatureV159').value='VARIABLE';
modal.click('[data-v108-tx-save]');
assert.equal(records.purchaseEvents[0].expense_bucket_v193,'VARIABLE');
assert.equal(records.purchaseEvents[0].cost_nature,'VARIABLE');
assert.equal(records.purchaseEvents[0].personal_owner_v193,undefined,
 'Switching back to household variable expense clears personal attribution');
console.log('CONTINUOUS_EDITOR_V167_PASS');
