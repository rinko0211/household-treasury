// node tests/expense-unified-v148.test.js
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
let asserts=0;const eq=(a,b,msg)=>{assert.equal(a,b,msg);asserts++},ok=(v,msg)=>{assert.ok(v,msg);asserts++};
const state={
 settings:{salaryDay:18,salary:540000,cash:50000},
 assets:{bank:50000},cashTransactions:[
 {id:'salary',date:'2026-10-16',cashflow_type:'INCOME_SALARY',description_raw:'給与',amount:540000,balance_after:540000},
 {id:'grocery',date:'2026-10-17',cashflow_type:'HOUSEHOLD_EXPENSE',economic_type:'EXPENSE',description_raw:'スーパー',category:'FOOD',amount:-1800,balance_after:538200},
 {id:'card',date:'2026-10-18',cashflow_type:'CARD_SETTLEMENT',description_raw:'楽天カード',amount:-12000,balance_after:526200},
 {id:'loan',date:'2026-10-20',cashflow_type:'DEBT_PAYMENT',description_raw:'車ローン',amount:-60000,balance_after:466200},
 {id:'ideco',date:'2026-10-21',cashflow_type:'INVESTMENT_CONTRIBUTION',description_raw:'iDeCo',amount:-12000,balance_after:454200}
 ],
 cardSettlements:[{card:'Rakuten',due_date:'2026-10-18',amount:12000}],
 purchaseEvents:[
 {purchase_id:'buy1',card:'Rakuten',purchase_date:'2026-10-18',merchant_raw:'カフェ',economic_type:'EXPENSE',category:'FOOD',original_amount:12000,billing_month:'2026-10',occurrence_index:1},
 {purchase_id:'buy1duplicate',card:'Rakuten',purchase_date:'2026-10-18',merchant_raw:'カフェ',economic_type:'EXPENSE',category:'FOOD',original_amount:12000,billing_month:'2026-10',occurrence_index:1}
 ],
 cashExpenses:[{id:'gift',date:'2026-10-19',description:'航空祭のお土産',category:'GIFTS_EVENTS',spending_class:'SPECIAL',amount:2500,economic_type:'EXPENSE'}],
 masters:{cards:[],fixedExpenses:[
   {id:'car-loan',name:'車ローン',amount:60000,day:20,paymentRoute:'DIRECT',cadence:'MONTHLY'},
   {id:'elec',name:'電気',amount:15000,day:10,paymentRoute:'CARD',cadence:'MONTHLY'},
   {id:'internet',name:'通信費',amount:10000,day:27,paymentRoute:'DIRECT',cadence:'MONTHLY'},
   {id:'family',name:'家族カード',amount:275000,day:20,paymentRoute:'CARD',cadence:'MONTHLY'},
   {id:'cash-allocation',name:'現金配分',amount:70000,day:20,paymentRoute:'DIRECT',cadence:'MONTHLY'},
   {id:'ideco-master',name:'iDeCo',amount:12000,day:20,paymentRoute:'DIRECT',cadence:'MONTHLY'},
   {id:'washer',name:'洗濯機',amount:120000,day:25,paymentRoute:'DIRECT',cadence:'ANNUAL',dueMonth:12}
 ]},rules:[],events:[]
};
class ClassList{constructor(){this.s=new Set()}add(x){this.s.add(x)}remove(x){this.s.delete(x)}contains(x){return this.s.has(x)}}
const dom=new Map();
class El{
 constructor(id){this.id=id;this.classList=new ClassList();this.dataset={};this.evt={};this._html='';this.attributes={};this.value='';this.children=[]}
 set innerHTML(value){
   this._html=String(value);this.generated=[];
   for(const m of this._html.matchAll(/<button\b[^>]*>/g)){
     const attrs=m[0],btn=new El('button');
     for(const kv of attrs.matchAll(/data-hub-([a-z]+)="([^"]*)"/g))btn.dataset['hub'+kv[1][0].toUpperCase()+kv[1].slice(1)]=kv[2];
     if(Object.keys(btn.dataset).length)this.generated.push(btn);
   }
   for(const m of this._html.matchAll(/id="([^"]+)"/g))dom.set(m[1],new El(m[1]));
   const match=this._html.match(/id="hubMonthV148"[^>]*value="([^"]+)"/);
   if(match)dom.get('hubMonthV148').value=match[1];
 }
 get innerHTML(){return this._html}
 setAttribute(k,v){this.attributes[k]=v}
 addEventListener(name,fn){(this.evt[name]??=[]).push(fn)}
 click(){for(const fn of this.evt.click||[])fn({preventDefault(){},stopPropagation(){}})}
 querySelectorAll(sel){
   if(!this.generated)return [];
   const m=sel.match(/\[data-hub-([a-z]+)\]/);
   if(!m)return [];
   const key='hub'+m[1][0].toUpperCase()+m[1].slice(1);
   return this.generated.filter(x=>x.dataset[key]!==undefined);
 }
 remove(){dom.delete(this.id)}
 appendChild(x){this.children.push(x);dom.set(x.id,x)}
 insertBefore(x){dom.set(x.id,x)}
 replaceChild(x,y){dom.set(x.id,x)}
}
const expense=new El('expenses'),legacy=new El('expenseTabRootV129'),head=new El('head');
dom.set('expenses',expense);dom.set('expenseTabRootV129',legacy);
const listeners={};
const events=[];
const window={
 householdSemanticV47:{
   normalizeCategoryValue:x=>x||null,
   inferCategory:(name,category)=>category||(/電気/.test(name)?'UTILITIES':/通信/.test(name)?'COMMUNICATION':/車ローン/.test(name)?'CAR':'OTHER'),
   inferSubcategory:(category,name,existing)=>existing||(
     category==='FOOD'?(/カフェ/.test(name)?'CAFE':'GROCERIES'):
     category==='GIFTS_EVENTS'?'GIFT':
     category==='UTILITIES'?'ELECTRICITY':
     category==='COMMUNICATION'?'INTERNET':'OTHER'
   ),
   CATEGORY_DEFS:{
     FOOD:{label:'食費',subs:['GROCERIES','CAFE','OTHER']},
     DAILY_GOODS:{label:'日用品',subs:['CLOTHING','HOUSEHOLD','OTHER']},
     GIFTS_EVENTS:{label:'イベント・贈答',subs:['GIFT','OTHER']},
     UTILITIES:{label:'公共料金',subs:['ELECTRICITY','OTHER']},
     COMMUNICATION:{label:'通信',subs:['INTERNET','OTHER']},
     CAR:{label:'車',subs:['OTHER']},
     OTHER:{label:'その他',subs:['OTHER']}
   }
 },
 getTreasuryStateRaw:()=>state,
 addEventListener:(kind,fn)=>(listeners[kind]??=[]).push(fn),
 householdCardCycleV81:{buildPlan:()=>({rows:[]})},
 openSemanticTransactionEditorV108:(kind,id)=>events.push([kind,id])
};
const document={
 readyState:'loading',getElementById:id=>dom.get(id)||null,
 createElement:tag=>new El(tag),head,
 addEventListener:(key,fn)=>(listeners['document:'+key]??=[]).push(fn)
};
const context={window,document,setTimeout:()=>{},Intl,Date,Number,Math,String,Set,Map,JSON,Error,structuredClone,console};
vm.createContext(context);
vm.runInContext(fs.readFileSync('treasury-ledger-v145.js','utf8'),context);
vm.runInContext(fs.readFileSync('expense-nature-rules-v152.js','utf8'),context);
vm.runInContext(fs.readFileSync('purchase-usage-ledger-v157.js','utf8'),context);
vm.runInContext(fs.readFileSync('expense-unified-v148.js','utf8'),context);
const app=window.householdExpenseUnifiedV148;
ok(!!app,'Unified expense API mounted');
let ledger=app.calculate(state,'2026-10','payday','2026-10-21');
eq(ledger.start,'2026-10-16','Payday begins 16 Oct');
eq(ledger.end,'2026-11-17','Payday ends 17 Nov');
eq(ledger.outActual,88300,'Cash outflow includes direct + card debit + loan + iDeCo');
eq(ledger.spentActual,16300,'Economic expenses excludes loan, settlement and investment; duplicate card row excluded');
const usage=window.householdUsageLedgerV157.calculate(state,'2026-10','payday');
eq(usage.start,'2026-10-16','Current pay period starts on 16 Oct');
eq(usage.consumption,16300,'Actual purchase-date spending');
eq(usage.debt,60000,'Car principal separately');
eq(usage.ideco,12000,'Investment separately');
eq(usage.funds,88300,'Consumption + debt + iDeCo');
let cash=app.usageBuckets(usage,state);
eq(cash.reduce((sum,b)=>sum+b.amount,0),usage.funds,'All purchase-use buckets reconcile to uses');
eq(cash.find(x=>x.id==='variable').amount,13800,'Grocery and card use as ordinary consumption');
eq(cash.find(x=>x.id==='fixed').amount,0,'No fixed actual in simple fixture');
eq(cash.find(x=>x.id==='undetermined').amount,0,'No undecided actual in simple fixture');
eq(usage.normalFixed+usage.normalVariable+usage.normalUndetermined,usage.ordinary,
 'Normal fixed/variable/undetermined reconcile without changing total');
eq(cash.find(x=>x.id==='special').amount,2500,'Cash gift as special expense');
eq(cash.find(x=>x.id==='debt').amount,60000,'Car principal separate from ordinary');
eq(cash.find(x=>x.id==='ideco').amount,12000,'iDeCo separate from consumption');
ok(!cash.some(x=>x.id==='cardUnallocated'||x.id==='review'),'No card-debit or review cost buckets');
const fixedReference=app.fixedReference(state,'2026-10');
eq(fixedReference.total,85000,'Only real recurring fixed masters counted as reference');
const budget=app.budgetReference(state,'2026-10');
eq(budget.fixed,85000,'Fixed reference consistent with budget');
eq(budget.living,345000,'Family card + cash allocation grouped into living budget');
eq(budget.ideco,12000,'iDeCo in own budget category');
eq(budget.total,442000,'No double counting of fixed, iDeCo, household envelopes');

ok(!fixedReference.items.some(x=>x.name==='家族カード'||x.name==='現金配分'||x.name==='iDeCo'),
  'Household living allocations and iDeCo not counted as fixed reference');
ok(fixedReference.items.some(x=>x.name==='電気'&&x.route==='CARD'),
  'Card-routed fixed expense is reference only, not extra cash outflow');
let economic=app.usageBuckets(usage,state);
eq(economic.find(x=>x.id==='variable').amount,13800,'Consumption ordinary');
eq(economic.find(x=>x.id==='special').amount,2500,'Consumption special');
const categories=app.subgroups(economic.find(x=>x.id==='variable'),'economic');
eq(categories.find(x=>x.key==='FOOD.GROCERIES').amount,1800,'Groceries subcategory');
eq(categories.find(x=>x.key==='FOOD.CAFE').amount,12000,'Cafe subcategory');
const middleCategories=app.categoryGroups(economic.find(x=>x.id==='variable'),'economic');
eq(middleCategories.find(x=>x.key==='FOOD').label,'食費','Middle tier is major category');
eq(middleCategories.find(x=>x.key==='FOOD').amount,13800,'Food middle category sums groceries + cafe');
eq(middleCategories.find(x=>x.key==='FOOD').subcategories.length,2,'Small subcategories grouped under Food');
eq(middleCategories.reduce((total,c)=>total+c.amount,0),13800,'Middle tier keeps purchase sum invariant');
const specialCategories=app.subgroups(economic.find(x=>x.id==='special'),'economic');
eq(specialCategories.find(x=>x.key==='GIFTS_EVENTS.GIFT').amount,2500,'Gift is special');
ok(categories.find(x=>x.key==='FOOD.CAFE').items.some(x=>x.editKind==='purchase'&&x.editId==='buy1'),'Card editor link');
ok(!categories.some(x=>x.items.some(y=>y.editId==='buy1duplicate')),'Duplicate card excluded');
if(listeners['document:DOMContentLoaded'])listeners['document:DOMContentLoaded'].forEach(fn=>fn());
ok(!dom.get('expenseLegacyDetailsV148')&&!dom.get('expenseTabRootV129'),'Duplicate legacy expense renderer removed');
ok(!!dom.get('expenseHubV148'),'New summary placed inside expenses');
expense.classList.add('active');
listeners['treasury:pagechange'][0]({detail:{page:'expenses'}});
let root=dom.get('expenseHubV148');
ok(root.innerHTML.includes('月次支出サマリー'),'Summary rendered');
ok(root.innerHTML.includes('通常の消費・生活費'),'Primary normal subtotal shown');
ok(root.innerHTML.includes('口座資金流出（引落日ベース）'),'Secondary bank mode explicitly named');
ok(!root.innerHTML.includes('カード引落（用途未配分）'),'Old card settlement expense category eliminated');
function btn(type,value){
 const key='hub'+type[0].toUpperCase()+type.slice(1);
 const found=root.querySelectorAll('[data-hub-'+type+']').find(x=>x.dataset[key]===value);
 ok(!!found,'Button exists '+type+' '+value);found.click();
}
btn('cycle','calendar');
ok(root.innerHTML.includes('2026-10-01 〜 2026-10-31'),'Calendar switch changes period');
btn('cycle','payday');
ok(root.innerHTML.includes('2026-10-16 〜 2026-11-17'),'Payday switch changes period');
btn('lens','economic');
ok(root.innerHTML.includes('消費・購入額'),'Consumption lens shown');
btn('bucket','variable');
ok(root.innerHTML.includes('食費'),'Tapping consumption expands categories');
ok(root.innerHTML.indexOf('data-hub-bucket="variable"')<root.innerHTML.indexOf('id="expenseHubDrilldownV148"')&&
   root.innerHTML.indexOf('id="expenseHubDrilldownV148"')<root.innerHTML.indexOf('data-hub-bucket="undetermined"'),
   'Variable category panel appears inline directly below variable, before the next bucket');
ok(!root.innerHTML.includes('data-hub-subcategory="FOOD.CAFE"'),
 'Subcategory and receipts remain closed until the major category is chosen');
btn('category','FOOD');
ok(root.innerHTML.includes('data-hub-subcategory="FOOD.CAFE"'),
 'Food category expands to its subcategories');
ok(!root.innerHTML.includes('data-hub-details="FOOD.CAFE"'),
 'Receipts stay collapsed until the subcategory is selected');
btn('subcategory','FOOD.CAFE');
ok(root.innerHTML.includes('カフェ'),'Tapping small category shows card purchase');
ok(root.innerHTML.indexOf('data-hub-category="FOOD"')<
   root.innerHTML.indexOf('data-hub-subcategory="FOOD.CAFE"')&&
   root.innerHTML.indexOf('data-hub-subcategory="FOOD.CAFE"')<
   root.innerHTML.indexOf('data-hub-details="FOOD.CAFE"'),
  'Three-level category, subcategory and purchase hierarchy is nested in order');
ok(root.innerHTML.includes('明細を編集'),'Editor action rendered');
const edit=root.querySelectorAll('[data-hub-edit]').find(x=>x.dataset.hubEdit==='purchase');
ok(!!edit,'Card edit button exists');edit.click();
eq(events[0][0],'purchase','Editor kind correct');
eq(events[0][1],'buy1','Editor opens exact selected row');
btn('bucket','fixed');
ok(root.innerHTML.includes('固定費マスターの月額内訳（参考）'),'Fixed detail shows read-only master reference');
ok(root.innerHTML.includes('毎月の基本予算（参考）'),'Plan shown separately from actual');
ok(root.innerHTML.includes('電気'),'Fixed reference contains electricity');
ok(root.innerHTML.includes('カード払い'),'Card-route reference labeled');
ok(!fs.readFileSync('index.html','utf8').includes('id="monthlyTreasuryTabV142"'),'Redundant monthly tab removed');
ok(fs.readFileSync('index.html','utf8').includes('expense-unified-v148.js?v=162'),'Unified hub loaded');
// v158: fixed and variable are PRESENTATION cost-behavior within economic NORMAL;
// source category overrides and review badges do not change booked consumption.
{
 const next={
   purchase_id:'electric-fixed-actual',card:'KABU&',
   purchase_date:'2026-10-19',merchant_raw:'Electric power bill',
   original_amount:3210,category:'UTILITIES',subcategory:'ELECTRICITY',
   economic_type:'EXPENSE',spending_class:'NORMAL',billing_month:'2026-12'
 };
 const incomplete={
   purchase_id:'unknown-cost-actual',card:'CARD_UNIDENTIFIED',
   purchase_date:'2026-10-19',merchant_raw:'Unknown consumption',
   original_amount:555,category:'OTHER',subcategory:'OTHER',
   economic_type:'EXPENSE',spending_class:'NORMAL',billing_month:'2026-12',
   review_status:'NEEDS_REVIEW'
 };
 state.purchaseEvents.push(next,incomplete);
 const updated=window.householdUsageLedgerV157.calculate(state,'2026-10','payday');
 eq(updated.normalFixed,3210,'ELECTRICITY is actual FIXED even when paid by card');
 eq(updated.normalVariable,13800,'Other variable groceries and cafe retain amount');
 eq(updated.normalUndetermined,555,'Unknown cost behavior is separate from variable/fixed');
 eq(updated.ordinary,17565,'Normal consumption subtotal unchanged by grouping');
 eq(updated.consumption,20065,'No extra costs created by fixed split');
 let b=app.usageBuckets(updated,state);
 eq(b.find(x=>x.id==='fixed').amount,3210,'Fixed line equals only actual electricity');
 eq(b.find(x=>x.id==='variable').amount,13800,'Variable line equals confirmed purchases');
 eq(b.find(x=>x.id==='undetermined').amount,555,'Unclassified is visible without pretending variable');
 const fixedCategory=app.categoryGroups(b.find(x=>x.id==='fixed'));
 eq(fixedCategory[0].label,'公共料金','Fixed tier uses a major category');
 eq(fixedCategory[0].subcategories[0].amount,3210,'Fixed small category matches actual expense');
 eq(b.filter(x=>['fixed','variable','undetermined','special'].includes(x.id))
      .reduce((a,x)=>a+x.amount,0),updated.consumption,'Expense bar sums exactly to consumption');
 eq(app.subgroups(b.find(x=>x.id==='fixed'))[0].key,'UTILITIES.ELECTRICITY',
  'Fixed expense expands to user-approved electricity subcategory');
 ok(updated.flags.some(x=>x.label==='Unknown consumption'),'Unclassified review warning independent');
 const reviewOnly=structuredClone(state);
 reviewOnly.purchaseEvents.find(x=>x.purchase_id==='unknown-cost-actual').review_status='RESOLVED';
 eq(window.householdUsageLedgerV157.calculate(reviewOnly,'2026-10','payday').consumption,
    updated.consumption,'Review status alone never changes money');
}
// v162: multiple ordinary categories aggregate before subcategory / receipts.
{
 const sample=structuredClone(state);
 sample.purchaseEvents.push(
  {purchase_id:'daily-clothes',card:'Rakuten',purchase_date:'2026-10-22',
   merchant_raw:'洋服店',original_amount:11460,economic_type:'EXPENSE',
   category:'DAILY_GOODS',subcategory:'CLOTHING',billing_month:'2026-12'},
  {purchase_id:'daily-supplies',card:'Rakuten',purchase_date:'2026-10-22',
   merchant_raw:'生活用品店',original_amount:4262,economic_type:'EXPENSE',
   category:'DAILY_GOODS',subcategory:'HOUSEHOLD',billing_month:'2026-12'}
 );
 const usage=window.householdUsageLedgerV157.calculate(sample,'2026-10','payday');
 const variable=app.usageBuckets(usage,sample).find(x=>x.id==='variable');
 const major=app.categoryGroups(variable);
 const daily=major.find(x=>x.key==='DAILY_GOODS');
 eq(daily.label,'日用品','Normal expense uses middle category 日用品');
 eq(daily.amount,15722,'日用品 contains both 衣類 and 生活用品');
 eq(daily.subcategories.find(x=>x.label==='衣類').amount,11460,'衣類 minor category remains intact');
 eq(daily.subcategories.find(x=>x.label==='生活用品').amount,4262,'生活用品 minor category remains intact');
 eq(major.reduce((total,x)=>total+x.amount,0),variable.amount,'Middle category total exactly matches variable total');
 eq(daily.subcategories.reduce((total,x)=>total+x.amount,0),daily.amount,'Minor categories reconcile to middle category');
 eq(daily.subcategories.flatMap(x=>x.items).length,2,'Exactly two source transactions remain');
}
console.log('PASS '+asserts+' expense unified v148 assertions');
