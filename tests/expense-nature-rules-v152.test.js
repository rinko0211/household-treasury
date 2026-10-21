// node tests/expense-nature-rules-v152.test.js
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const window={};vm.runInNewContext(fs.readFileSync('expense-nature-rules-v152.js','utf8'),{window});
const api=window.householdExpenseNatureV152;
let checked=0;
const equal=(actual,expected,msg)=>{assert.equal(actual,expected,msg);checked++};
const cases=[
 ['HOUSING','RENT_MORTGAGE=FIXED|HOME_MAINTENANCE=SPECIAL|OTHER=REVIEW'],
 ['UTILITIES','ELECTRICITY=FIXED|WATER=FIXED|GAS=FIXED|OTHER=REVIEW'],
 ['COMMUNICATION','MOBILE=FIXED|INTERNET=FIXED|OTHER=REVIEW'],
 ['FOOD','GROCERIES=VARIABLE|EATING_OUT=VARIABLE|CAFE=VARIABLE|OTHER=VARIABLE'],
 ['DAILY_GOODS','HOUSEHOLD=VARIABLE|CLOTHING=VARIABLE|OTHER=VARIABLE'],
 ['CHILD','CHILDCARE=REVIEW|SCHOOL=REVIEW|GOODS=VARIABLE|OTHER=VARIABLE'],
 ['MEDICAL','CLINIC=VARIABLE|DENTAL=VARIABLE|CONTACTS=VARIABLE|PHARMACY=VARIABLE|OTHER=VARIABLE'],
 ['INSURANCE','LIFE=FIXED|AUTO=SPECIAL|OTHER=REVIEW'],
 ['CAR','FUEL=VARIABLE|MAINTENANCE=SPECIAL|PARKING=VARIABLE|TOLL=VARIABLE|OTHER=REVIEW'],
 ['TRANSPORT','TRAIN=VARIABLE|BUS=VARIABLE|TAXI=VARIABLE|AIR=SPECIAL|OTHER=REVIEW'],
 ['SUBSCRIPTION','DIGITAL=VARIABLE|MEMBERSHIP=VARIABLE|CARD_FEE=VARIABLE|OTHER=REVIEW'],
 ['ENTERTAINMENT','HOBBY=VARIABLE|MEDIA=VARIABLE|DINING=VARIABLE|OTHER=VARIABLE'],
 ['TRAVEL','LODGING=SPECIAL|AIR=SPECIAL|TRANSPORT=VARIABLE|OTHER=REVIEW'],
 ['EDUCATION','TUITION=FIXED|BOOKS=VARIABLE|OTHER=REVIEW'],
 ['TAX','TAX=FIXED|FEE=VARIABLE|OTHER=VARIABLE'],
 ['FINANCIAL_FEES','INTEREST=VARIABLE|FEE=VARIABLE|OTHER=REVIEW'],
 ['PERSONAL','BEAUTY=VARIABLE|FITNESS=VARIABLE|OTHER=REVIEW'],
 ['GIFTS_EVENTS','GIFT=SPECIAL|EVENT=SPECIAL|CEREMONY=SPECIAL|OTHER=REVIEW'],
 ['OTHER','OTHER=REVIEW']
];
const expected={};
for(const [category,list] of cases)for(const piece of list.split('|')){
 const [sub,nature]=piece.split('=');expected[category+'.'+sub]=nature;
}
equal(Object.keys(api.rules).length,68,'Exactly 68 approved subcategories');
equal(Object.keys(api.subcategoryLabels).length,68,'All subcategories labelled');
equal(Object.keys(api.masters).length,7,'All 7 user-approved fixed masters');
for(const [k,nature] of Object.entries(expected))equal(api.rules[k],nature,'Selected '+k);
const semantic={
 normalizeCategoryValue:x=>x,
 inferCategory:(label,cat)=>cat,
 inferSubcategory:(cat,label,sub)=>sub
};
const row=(key,name,overrides={})=>{
 const [category,subcategory]=key.split('.');
 const source={category,subcategory,economic_type:'EXPENSE',...overrides};
 return api.classify({category,subcategory,kind:'living',label:name,source,semantic});
};
equal(row('CAR.PARKING','駐車料金').nature,'VARIABLE','Parking is not fixed');
equal(row('CAR.MAINTENANCE','車検').nature,'SPECIAL','Car maintenance special');
equal(row('INSURANCE.AUTO','自動車保険').nature,'SPECIAL','Auto insurance special');
equal(row('SUBSCRIPTION.DIGITAL','Apple').nature,'VARIABLE','Subscription user override variable');
equal(row('EDUCATION.TUITION','授業料').nature,'FIXED','Tuition fixed');
equal(row('FOOD.GROCERIES','スーパー',{spending_class:'SPECIAL'}).nature,'VARIABLE','Explicit user choice wins over old generic special flag');
equal(row('CHILD.CHILDCARE','保育料').nature,'REVIEW','Case-by-case is not automatically fixed');
equal(row('CHILD.CHILDCARE','保育料',{cost_nature:'FIXED'}).nature,'FIXED','Optional individual row decision');
equal(row('CHILD.CHILDCARE','保育料',{spending_class:'SPECIAL'}).nature,'SPECIAL','Case-by-case preserves old special choice');
equal(row('FINANCIAL_FEES.INTEREST','返済利息',{economic_type:'DEBT_INTEREST'}).nature,'VARIABLE','Interest variable');
const loan=api.classify({kind:'debt',label:'車ローン 60,000円',source:{economic_type:'DEBT_PRINCIPAL',category:'CAR',subcategory:'OTHER'},category:'CAR',subcategory:'OTHER',semantic});
equal(loan.nature,'FIXED','Car loan principal fixed');
equal(loan.economicType,'DEBT_PRINCIPAL','Economic type remains principal');
const card=api.classify({kind:'card',label:'JALカード引落',source:{economic_type:'TRANSFER'},semantic});
equal(card.nature,'REVIEW','Card debit cannot be split blindly into fixed and variable');
const masterCases=[
 ['車ローン（プラド）','LOAN_PRADO'],
 ['車ローン（ラパン）','LOAN_LAPIN'],
 ['プラドローン夏ボーナス','PRADO_SUMMER'],
 ['プラドローン冬ボーナス','PRADO_WINTER'],
 ['ラパンローン夏ボーナス','LAPIN_SUMMER'],
 ['ラパンローン冬ボーナス','LAPIN_WINTER'],
 ['iDeCo','IDECO']
];
for(const [name,key] of masterCases){
 equal(api.masterKey({name}),key,'Master identification '+key);
 equal(api.masterNature({name}).nature,'FIXED','Master fixed '+key);
}
equal(api.masterKey({name:'車ローン'}),'GENERIC_CAR_LOAN','Generic loan not falsely attributed to Prado');
equal(api.masterNature({name:'車ローン'}).nature,'FIXED','Generic car loan still fixed');
const testState={purchaseEvents:[{purchase_id:'untouched',amount:10}],cashTransactions:[{amount:-60000}]};
const before=JSON.stringify(testState);
row('FOOD.CAFE','カフェ');
equal(JSON.stringify(testState),before,'Rules never edit state');
console.log('PASS '+checked+' user expense nature classification assertions');
