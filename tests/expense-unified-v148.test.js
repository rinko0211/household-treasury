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
vm.runInContext(fs.readFileSync('personal-ledger-v186.js','utf8'),context);
vm.runInContext(fs.readFileSync('manual-expense-delete-v192.js','utf8'),context);
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
eq(cash.find(x=>x.id==='fixed').amount,60000,'Fixed and car loan share one actual fixed-commitment row');
eq(cash.find(x=>x.id==='undetermined').amount,0,'No undecided actual in simple fixture');
eq(usage.normalFixed+usage.normalVariable+usage.normalUndetermined,usage.ordinary,
 'Normal fixed/variable/undetermined reconcile without changing total');
eq(cash.find(x=>x.id==='special').amount,2500,'Cash gift as special expense');
ok(!cash.some(x=>x.id==='debt'),'No separate debt bucket: loan is nested inside 固定費・ローン');
 eq(app.categoryGroups(cash.find(x=>x.id==='fixed'))[0].label,'ローン・借入返済（消費外）','Loan is visible as a middle category of combined fixed row');
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
ok(root.innerHTML.includes('固定支払マスターの月額内訳（ローン含む・参考）'),'Fixed detail shows read-only master reference');
 ok(root.innerHTML.includes('固定費・ローン'),'Fixed and loans share one actual category');
 ok(root.innerHTML.includes('ローン・借入返済（消費外）'),'Fixed drilldown contains loan middle category');
ok(root.innerHTML.includes('毎月の基本予算（参考）'),'Plan shown separately from actual');
ok(root.innerHTML.includes('電気'),'Fixed reference contains electricity');
ok(root.innerHTML.includes('カード払い'),'Card-route reference labeled');
ok(!fs.readFileSync('index.html','utf8').includes('id="monthlyTreasuryTabV142"'),'Redundant monthly tab removed');
ok(fs.readFileSync('index.html','utf8').includes('expense-unified-v148.js?v=192'),'Unified hub loaded');
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
 eq(b.find(x=>x.id==='fixed').amount,63210,'Combined fixed line shows electricity 3,210 plus loan principal 60,000');
 eq(b.find(x=>x.id==='variable').amount,13800,'Variable line equals confirmed purchases');
 eq(b.find(x=>x.id==='undetermined').amount,555,'Unclassified is visible without pretending variable');
 const fixedCategory=app.categoryGroups(b.find(x=>x.id==='fixed'));
 ok(fixedCategory.some(x=>x.label==='公共料金'&&x.amount===3210),'Electricity appears under combined fixed row');
 ok(fixedCategory.some(x=>x.label==='ローン・借入返済（消費外）'&&x.amount===60000),'Loan appears below same fixed row');
 eq(fixedCategory.find(x=>x.label==='公共料金').subcategories[0].amount,3210,'Electricity subcategory matches actual expense');
 eq(b.filter(x=>['fixed','variable','undetermined','special'].includes(x.id))
      .reduce((a,x)=>a+x.amount,0),updated.consumption+updated.debt,'Combined bar sums consumption plus debt exactly once');
 eq(app.subgroups(b.find(x=>x.id==='fixed')).find(x=>x.key==='UTILITIES.ELECTRICITY').key,'UTILITIES.ELECTRICITY',
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
// The new drilldown must use the same restrained dark surfaces as the main ledger.
{
 const css=fs.readFileSync('expense-unified-v148.css','utf8');
 ok(css.includes('.hub-category')&&css.includes('.hub-subcategory'),
   'Middle and small category rows have dedicated, consistent styling');
 ok(css.includes('.hub-drilldown{')&&css.includes('background:transparent;border-left:1px'),
   'Large teal legacy drilldown card replaced with subtle inline nested layout');
 ok(!css.includes('#expenseHubV148 .hub-group{'),
   'Legacy oversized category card styling retired');
}
// v165: flagged purchases must be actionable from the review disclosure,
// including explicit top-up/transfer checks; warnings aren't new expenses.
{
 const old=window.householdUsageLedgerV157.calculate(state,'2026-10','payday');
 const topup={purchase_id:'topup-flag-demo',card:'CARD_UNIDENTIFIED',
  purchase_date:'2026-10-20',merchant_raw:'電子マネーチャージ疑い',
  original_amount:1000,category:'FOOD',subcategory:'OTHER',
  economic_type:'EXPENSE',spending_class:'NORMAL',billing_month:'2026-12',
  review_status:'NEEDS_REVIEW',potential_prepaid_topup:true};
 state.purchaseEvents.push(topup);
 const now=window.householdUsageLedgerV157.calculate(state,'2026-10','payday');
 eq(now.consumption,old.consumption+1000,'Review warning counts only the underlying expense');
 ok(now.flags.some(x=>x.label==='電子マネーチャージ疑い'),
   'Topup flag included in review list without double counting');
 app.render();
 ok(root.innerHTML.includes('チャージ・資金移動の疑い'),
   'Flagged topup clearly explains why confirmation is needed');
 ok(root.innerHTML.includes('固定・変動の分類未確定'),
   'Review shows unresolved cost-behavior reason');
 ok(root.innerHTML.includes('この明細を確認・編集'),
   'Review section gives a direct action, not just label and amount');
 const edit=root.querySelectorAll('[data-hub-edit]').find(x=>x.dataset.hubEditid==='topup-flag-demo');
 ok(!!edit,'Flagged original purchase has an editor button');
 edit.click();
 eq(events[events.length-1][0],'purchase','Review edit routes to purchase editor');
 eq(events[events.length-1][1],'topup-flag-demo','Review edit targets exact original transaction');
 topup.economic_type='TRANSFER';topup.potential_prepaid_topup=false;topup.review_status='RESOLVED';
 const confirmed=window.householdUsageLedgerV157.calculate(state,'2026-10','payday');
 eq(confirmed.consumption,old.consumption,'Confirmed topup removes spending, not re-booked as another expense');
 state.purchaseEvents.pop();
 app.render();
}
// v167: save/re-render must leave the user inside the selected drilldown
// and preserve the scroll origin so multiple entries can be edited in place.
{
 expense.classList.add('active');
 const followup={purchase_id:'second-cafe',card:'Rakuten',purchase_date:'2026-10-20',
   merchant_raw:'次のカフェ',original_amount:800,category:'FOOD',subcategory:'CAFE',
   economic_type:'EXPENSE',spending_class:'NORMAL',billing_month:'2026-12'};
 state.purchaseEvents.push(followup);
 const sel=app.getSelection();
 if(sel.openBucket!=='variable')btn('bucket','variable');
 if(app.getSelection().openCategory!=='FOOD')btn('category','FOOD');
 if(app.getSelection().openSubcategory!=='FOOD.CAFE')btn('subcategory','FOOD.CAFE');
 window.scrollY=730;let restored=null;window.scrollTo=(x,y)=>{restored=y};
 const edits=root.querySelectorAll('[data-hub-edit]');
 ok(edits.length>=2,'Two visible edit actions in same subcategory');
 const first=edits[0],second=edits[1],context=app.captureEditContext(first.dataset.hubEdit,first.dataset.hubEditid);
 ok(!!context,'Captured active expense editing context');
 eq(context.next.id,second.dataset.hubEditid,'Next row captured before category regrouping');
 eq(context.openCategory,'FOOD','Major category preserved');
 eq(context.openSubcategory,'FOOD.CAFE','Minor category preserved');
 app.render();
 app.restoreEditContext(context);
 eq(restored,730,'Scroll position restored after saving the edited record');
 eq(app.getSelection().openBucket,'variable','Variable section remains expanded');
 eq(app.getSelection().openSubcategory,'FOOD.CAFE','Minor category remains expanded after save');
 const staleReview=dom.get('hubReviewV157');
 if(staleReview){staleReview.open=true;app.render();ok(root.innerHTML.includes('id="hubReviewV157" open'),
   'Review disclosure remains expanded across a re-render');}
 state.purchaseEvents.pop();app.render();expense.classList.remove('active');
}
const semanticEditorSource=fs.readFileSync('semantic-ui-v48.js','utf8');
ok(semanticEditorSource.includes('transactionEditorTopupV165'),
   'Semantic editor gives explicit prepaid purchase-versus-transfer decision');
ok(semanticEditorSource.includes('data-v108-tx-next')&&
   semanticEditorSource.includes('openTransactionEditor(nextRecord.kind,nextRecord.id)'),
   'Save-and-next action opens next original transaction without revisiting list');
ok(semanticEditorSource.includes('restoreTransactionEditContext(editContext)'),
   'Category save restores prior position rather than jumping back');
ok(semanticEditorSource.includes("o.potential_prepaid_topup=false"),
   'Explicit confirmation can clear the topup warning');
// v169: loan is fixed in the monthly PAYMENTS plan, not an ordinary
// purchase/consumption expense (48k + 12k from existing master).
{
 const st=structuredClone(state);
 const main=st.masters.fixedExpenses.find(x=>x.id==='car-loan');
 main.amount=48000;main.name='車ローン（プラド）';main.economic_type='DEBT_PRINCIPAL';main.expense_scope='DEBT';
 st.masters.fixedExpenses.push({id:'lapin',name:'車ローン（ラパン）',cadence:'MONTHLY',
  economic_type:'DEBT_PRINCIPAL',expense_scope:'DEBT',amount:12000,active:true,forecastEnabled:true});
 const loans=app.loanReference(st,'2026-10');
 eq(loans.total,60000,'Two loans sum to 60,000 monthly fixed commitments');
 ok(loans.items.some(x=>x.name.includes('プラド')&&x.amount===48000),'Prado installment preserved');
 ok(loans.items.some(x=>x.name.includes('ラパン')&&x.amount===12000),'Lapin installment preserved');
 eq(app.fixedReference(st,'2026-10').total,25000,'Loans not included again in fixed consumption');
 const budget=app.budgetReference(st,'2026-10');
 eq(budget.loans,60000,'Budget shows loans as fixed outgoings');
 eq(budget.fixed,25000,'Budget shows only normal recurring consumption in fixed category');
 eq(budget.total,budget.living+budget.fixed+budget.loans+budget.ideco+budget.investment,
  'Monthly plan includes every commitment exactly once');
 const usage=window.householdUsageLedgerV157.calculate(st,'2026-10','payday');
 eq(usage.consumption,window.householdUsageLedgerV157.calculate(state,'2026-10','payday').consumption,'Source purchase consumption remains invariant');
}
// v187: the personal allowance is a native economic bucket, not a card.
{
 const personal=window.householdPersonalLedgerV186;
 const st=structuredClone(state);
 st.privatePersonalSeedV186=true;
 st.personalExpenseBudgets={wife:40000,self:20000};
 st.personalExpenses=[
  {id:'wife',owner:'wife',amount:40000,date:'',description:'妻に渡した個人費（消費済み）',cycle_start:'2026-10-16'},
  {id:'self',owner:'self',amount:6000,date:'2026-10-30',description:'飲み会',cycle_start:'2026-10-16'}
 ];
 const original=window.householdUsageLedgerV157.calculate(st,'2026-10','payday');
 const owner=app.usageBuckets(original,st,true);
 const shared=app.usageBuckets(original,st);
 const privateBucket=owner.find(x=>x.id==='personal');
 eq(privateBucket.amount,46000,'Personal costs are a native category');
 eq(owner.reduce((a,x)=>a+x.amount,0),original.funds+46000,'Chart groups reconcile with personal total');
 eq(privateBucket.items.length,2,'Personal category exposes both recipients');
 ok(!shared.some(x=>x.id==='personal'),'Family share never receives private expense category');
 eq(shared.find(x=>x.id==='variable').amount,owner.find(x=>x.id==='variable').amount,
   'Variable-only family view excludes personal category');
 const cat=app.categoryGroups(privateBucket,'economic');
 eq(cat.find(x=>x.key==='PERSONAL_WIFE').amount,40000,'Wife amount in existing category accordion');
 eq(cat.find(x=>x.key==='PERSONAL_SELF').amount,6000,'Own actual payments in same accordion');
 ok(cat.find(x=>x.key==='PERSONAL_SELF').label.includes('14,000'),
   'Own budget remaining shown inside category heading, without new card');
 const matchedState=structuredClone(st);
 matchedState.purchaseEvents.push({
  purchase_id:'self-drinks-import',card:'Rakuten',purchase_date:'2026-10-30',
  merchant_raw:'飲み会',original_amount:6000,category:'FOOD',subcategory:'CAFE',
  economic_type:'EXPENSE',spending_class:'NORMAL',billing_month:'2026-12'
 });
 const matchedUsage=window.householdUsageLedgerV157.calculate(matchedState,'2026-10','payday');
 const matchedRows=app.usageBuckets(matchedUsage,matchedState,true);
 const sharedRows=app.usageBuckets(matchedUsage,matchedState);
 eq(matchedRows.find(x=>x.id==='personal').amount,46000,'Matching import does not create new personal charge');
 eq(matchedRows.reduce((a,x)=>a+x.amount,0),original.funds+46000,
    'A subsequent card import cannot double count the drinks');
 eq(sharedRows.find(x=>x.id==='variable').amount,shared.find(x=>x.id==='variable').amount,
    'Matching personal card import is not disclosed on wife variable view');
 state.personalExpenses=st.personalExpenses;
 state.personalExpenseBudgets=st.personalExpenseBudgets;
 state.privatePersonalSeedV186=true;
 app.render();
 ok(root.innerHTML.includes('data-hub-bucket="personal"'),'Personal is rendered with regular expense lines');
 ok(!root.innerHTML.includes('hubPersonalV186'),'Old standalone personal card removed');
 ok(root.innerHTML.includes('消費・購入額（個人費を含む）'),'Consumption amount includes private expense');
 const legendHtml=root.innerHTML.split('<div class="hub-legend">')[1]?.split('</div>')[0]||'';
 ok(legendHtml.includes('個人費') && legendHtml.includes('%'),
   'Personal participates in the existing graph legend and shares');
 btn('bucket','personal');
 btn('category','PERSONAL_SELF');
 btn('subcategory','PERSONAL|self');
 ok(root.innerHTML.includes('飲み会'),'Personal receipts open through the existing category/subcategory navigation');
 delete state.personalExpenses;delete state.personalExpenseBudgets;delete state.privatePersonalSeedV186;
 app.render();
}
// v191: chronological use-date ordering applies inside every expense detail
// without changing category totals or the immutable source ledger.
{
 const sample=[
  {kind:'purchase',identity:'purchase:a',date:'2026-10-19',label:'古いカフェ',amount:1900,category:'FOOD',subcategory:'CAFE',costNatureKey:'FOOD.CAFE'},
  {kind:'purchase',identity:'purchase:b',date:'2026-10-23',label:'新しいカフェ',amount:2300,category:'FOOD',subcategory:'CAFE',costNatureKey:'FOOD.CAFE'},
  {kind:'cash',identity:'cash:c',date:'',label:'日付未確定カフェ',amount:300,category:'FOOD',subcategory:'CAFE',costNatureKey:'FOOD.CAFE'},
  {kind:'purchase',identity:'purchase:d',date:'2026-10-21',label:'中間カフェ',amount:2100,category:'FOOD',subcategory:'CAFE',costNatureKey:'FOOD.CAFE'},
  {kind:'purchase',identity:'purchase:e',date:'2026-10-23',label:'同日二件目',amount:550,category:'FOOD',subcategory:'CAFE',costNatureKey:'FOOD.CAFE'}
 ];
 const rawOrder=sample.map(x=>x.label).join('|');
 const expected='新しいカフェ|同日二件目|中間カフェ|古いカフェ|日付未確定カフェ';
 const ordered=app.orderDetailsByUsageDay(sample);
 eq(ordered.map(x=>x.label).join('|'),expected,'Use date descending; same-day stable; undated last');
 eq(sample.map(x=>x.label).join('|'),rawOrder,'Ordering does not mutate canonical source');
 const bucket={id:'variable',items:sample};
 const subtotal=sample.reduce((a,x)=>a+x.amount,0);
 const middle=app.categoryGroups(bucket,'economic').find(x=>x.key==='FOOD');
 eq(middle.items.map(x=>x.label).join('|'),expected,'Major category detail order matches use dates');
 eq(middle.subcategories.find(x=>x.key==='FOOD.CAFE').items.map(x=>x.label).join('|'),
   expected,'Nested minor category detail order matches use dates');
 eq(middle.amount,subtotal,'Date sorting leaves category total unchanged');
 eq(middle.subcategories[0].amount,subtotal,'Date sorting leaves subcategory total unchanged');
 const dates=['2026-10-19','2026-10-23','2026-10-21'];
 const names=['カフェ古い明細','カフェ新しい明細','カフェ中間明細'];
 for(let i=0;i<dates.length;i++)state.purchaseEvents.push({
   purchase_id:'v191-date-order-'+i,card:'MUFG/DC/JAL',
   purchase_date:dates[i],merchant_raw:names[i],original_amount:100+i,
   economic_type:'EXPENSE',category:'FOOD',subcategory:'CAFE',billing_month:'2026-12'
 });
 const originalCalc=window.householdUsageLedgerV157.calculate(state,'2026-10','payday');
 app.render();
 if(app.getSelection().lens!=='economic')btn('lens','economic');
 if(app.getSelection().openBucket!=='variable')btn('bucket','variable');
 if(app.getSelection().openCategory!=='FOOD')btn('category','FOOD');
 if(app.getSelection().openSubcategory!=='FOOD.CAFE')btn('subcategory','FOOD.CAFE');
 const html=root.innerHTML;
 ok(names.every(x=>html.includes(x)),'All imported card statements are shown in expense detail');
 ok(html.indexOf(names[1])<html.indexOf(names[2])&&
   html.indexOf(names[2])<html.indexOf(names[0]),
   'Rendered receipts are newest use-date first, even when imported out of order');
 state.purchaseEvents.splice(-dates.length,dates.length);
 const restoredCalc=window.householdUsageLedgerV157.calculate(state,'2026-10','payday');
 eq(originalCalc.consumption-restoredCalc.consumption,303,
   'Date ordering does not modify financial calculation');
 app.render();
}
// v192: delete only manually entered rows IN the expense detail; imported
// PDF/card transactions are immutable. The restore control stays on Expenses.
{
 // Bypass the legacy one-time welfare migration during this isolated assertion.
 state.privatePersonalSeedV186=true;
 let backups=0;
 window.treasuryRecoverySnapshot=()=>{backups++};
 window.confirm=()=>true;
 window.replaceTreasuryState=next=>{
   for(const key of Object.keys(state))delete state[key];
   Object.assign(state,structuredClone(next));
   return true;
 };
 const idx=state.cashExpenses.length;
 state.cashExpenses.push({id:'v192-manual-duplicate',date:'2026-10-21',
   description:'手動入力テスト削除',amount:777,
   economic_type:'EXPENSE',spending_class:'NORMAL',category:'FOOD',
   subcategory:'CAFE',payment_method:'CASH',source_file:'chat-generated.csv'});
 const pIdx=state.purchaseEvents.length;
 state.purchaseEvents.push({purchase_id:'pdf-v192-untouchable',card:'MUFG/DC/JAL',
   pdf_card_identity:'JAL-1234',mdc_import_v144:true,
   source_file:'MDC_PDF_2026-12.csv',purchase_date:'2026-10-21',
   original_amount:777,merchant_raw:'公式JALの正本',economic_type:'EXPENSE',
   spending_class:'NORMAL',category:'FOOD',subcategory:'CAFE'});
 const before=window.householdUsageLedgerV157.calculate(state,'2026-10','payday').consumption;
 app.render();
 if(app.getSelection().lens!=='economic')btn('lens','economic');
 if(app.getSelection().openBucket!=='variable')btn('bucket','variable');
 if(app.getSelection().openCategory!=='FOOD')btn('category','FOOD');
 if(app.getSelection().openSubcategory!=='FOOD.CAFE')btn('subcategory','FOOD.CAFE');
 ok(root.innerHTML.includes('手動明細を削除'),'Each manual detail has a delete control');
 ok(!root.innerHTML.includes('data-hub-delete="purchase:'+pIdx+'"'),
   'PDF statement has no delete action');
 const button=root.querySelectorAll('[data-hub-delete]').find(x=>x.dataset.hubDelete==='cash:'+idx);
 ok(!!button,'Delete button linked to the specific manual record');
 button.click();
 eq(state.cashExpenses[idx].count_in_spending,false,'Soft deletion saved in canonical ledger');
 eq(state.cashExpenses[idx].manually_deleted_v192,true,'Deleted manual row gets audit marker');
 eq(state.purchaseEvents[pIdx].count_in_spending,undefined,'PDF canonical row untouched');
 const after=window.householdUsageLedgerV157.calculate(state,'2026-10','payday').consumption;
 eq(before-after,777,'Only manual duplicate removed from expenses totals');
 ok(root.innerHTML.includes('削除した手動明細を復元'),'Restore section remains on expense page');
 const restore=root.querySelectorAll('[data-hub-restore]').find(x=>x.dataset.hubRestore==='cash:'+idx);
 ok(!!restore,'Restore link points to same record');
 restore.click();
 eq(state.cashExpenses[idx].count_in_spending,undefined,'Restored original counting state');
 eq(window.householdUsageLedgerV157.calculate(state,'2026-10','payday').consumption,before,
   'Restoration makes exactly one manual expense count again');
 eq(backups,2,'Pre-change backups taken for delete and restore');
 state.cashExpenses.pop();state.purchaseEvents.pop();app.render();
}
// v193: independent fixed/variable/personal selection. Pink expenses are
// allocated to the recipient, without leaking to the variable-only share.
{
 const st=structuredClone(state);
 st.privatePersonalSeedV186=true;
 st.personalExpenseBudgets={wife:40000,self:20000};
 st.personalExpenses=[
  {id:'wife-old',owner:'wife',amount:40000,cycle_start:'2026-10-16',
    description:'妻に渡した個人費（消費済み）'},
  {id:'self-old',owner:'self',amount:6000,date:'2026-10-30',
    cycle_start:'2026-10-16',description:'飲み会'}
 ];
 const base=window.householdUsageLedgerV157.calculate(st,'2026-10','payday');
 const baseline=app.usageBuckets(base,st,true);
 const beforeVariable=baseline.find(b=>b.id==='variable').amount;
 const start=st.purchaseEvents.length;
 st.purchaseEvents.push(
  {purchase_id:'wife-private-v193',card:'Rakuten',purchase_date:'2026-10-22',
   merchant_raw:'妻の私物',original_amount:900,category:'DAILY_GOODS',
   subcategory:'OTHER',economic_type:'EXPENSE',spending_class:'NORMAL',
   expense_bucket_v193:'PERSONAL',personal_owner_v193:'wife'},
  {purchase_id:'self-private-v193',card:'MUFG/DC/JAL',purchase_date:'2026-10-23',
   merchant_raw:'本人の飲料',original_amount:1500,category:'FOOD',
   subcategory:'CAFE',economic_type:'EXPENSE',spending_class:'NORMAL',
   expense_bucket_v193:'PERSONAL',personal_owner_v193:'self'},
  {purchase_id:'unassigned-old-personal',card:'Rakuten',purchase_date:'2026-10-24',
   merchant_raw:'以前の個人支出',original_amount:200,category:'PERSONAL',
   subcategory:'OTHER',economic_type:'EXPENSE',spending_class:'NORMAL'},
  {purchase_id:'explicit-variable-overrides-category',card:'Rakuten',
   purchase_date:'2026-10-25',merchant_raw:'明示した家計変動費',original_amount:700,
   category:'PERSONAL',subcategory:'OTHER',economic_type:'EXPENSE',
   spending_class:'NORMAL',cost_nature:'VARIABLE',expense_bucket_v193:'VARIABLE'}
 );
 const usage=window.householdUsageLedgerV157.calculate(st,'2026-10','payday');
 const owner=app.usageBuckets(usage,st,true),shared=app.usageBuckets(usage,st,false);
 const pink=owner.find(x=>x.id==='personal');
 eq(pink.amount,48600,'Pink personal = prior 46k + wife's 900 + self 1,500 + unassigned 200');
 eq(owner.reduce((v,b)=>v+b.amount,0),usage.funds+46000,
   'Rebucketed transactions never inflate accounting totals');
 eq(shared.reduce((v,b)=>v+b.amount,0),usage.funds-2600,
   'Variable-only shared source excludes all classified personal entries');
 eq(shared.find(x=>x.id==='variable').amount,beforeVariable+700,
   'Wife variable spending excludes newly classified personal receipts');
 const recipients=app.categoryGroups(pink,'economic');
 eq(recipients.find(x=>x.key==='PERSONAL_WIFE').amount,40900,
   'Wife allowance and wife individual purchases reconcile');
 eq(recipients.find(x=>x.key==='PERSONAL_SELF').amount,7500,
   'Self original 6k plus new 1,500 tracked in same pink category');
 eq(recipients.find(x=>x.key==='PERSONAL_UNASSIGNED').amount,200,
   'Unknown old personal owner must not be guessed');
 ok(recipients.find(x=>x.key==='PERSONAL_SELF').label.includes('12,500'),
   'Self 20k budget remaining updates to 12,500');
 const summary=window.householdPersonalLedgerV186.presentation(st,usage).summary;
 eq(summary.wifeSpent,40900,'Wife personal spending summary includes tagged purchases');
 eq(summary.selfSpent,7500,'Self personal spending summary includes tagged purchases');
 eq(summary.unassignedSpent,200,'Legacy unassigned personal remains separate');
 const matched=structuredClone(st);
 matched.purchaseEvents.push({purchase_id:'exact-self-match',card:'Rakuten',
   purchase_date:'2026-10-30',merchant_raw:'飲み会',original_amount:6000,
   category:'FOOD',subcategory:'CAFE',economic_type:'EXPENSE',
   spending_class:'NORMAL',expense_bucket_v193:'PERSONAL',personal_owner_v193:'self'});
 const matchedUsage=window.householdUsageLedgerV157.calculate(matched,'2026-10','payday');
 const linked=app.usageBuckets(matchedUsage,matched,true);
 eq(linked.find(x=>x.id==='personal').amount,48600,
   'Explicitly tagged card receipt matching recorded personal drink is counted once');
 ok(!linked.find(x=>x.id==='variable').items.some(x=>x.label==='飲み会'),
   'Personal drink must not appear in variable spending');
 eq(st.purchaseEvents.length,start+4,'Rendering changes no source records');
}
console.log('PASS '+asserts+' expense unified v148 assertions');
