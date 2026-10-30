'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('personal-ledger-v186.js','utf8');
let persisted={cashExpenses:[],purchaseEvents:[],cashTransactions:[]},writes=0,synced=0;
const clone=x=>JSON.parse(JSON.stringify(x));
const win={
  getTreasuryState:()=>clone(persisted),
  replaceTreasuryState:next=>{persisted=clone(next);writes++;return true;},
  cloudSyncOnLocalSave:()=>synced++,
  setTreasurySaveStatus:()=>{}
};
const ctx={window:win,document:{getElementById:()=>null},Intl,Date,Number,String,Math,JSON,
  structuredClone,Map,Set,Array,Object,RegExp};
vm.runInNewContext(source,ctx,{filename:'personal-ledger-v186.js'});
const ledger=win.householdPersonalLedgerV186;
assert.ok(ledger);
const v=ledger.ensure(persisted);
assert.equal(writes,1,'Seed once');
assert.equal(synced,1,'Trigger normal encrypted sync');
assert.equal(v.privatePersonalSeedV186,true);
assert.equal(v.cashExpenses.length,1);
assert.equal(v.cashExpenses[0].description,'厚生費');
assert.equal(v.cashExpenses[0].cost_nature,'VARIABLE');
assert.equal(v.cashExpenses[0].payment_method,'支払方法未申告','Do not invent cash/card payment');
const p={start:'2026-10-16',end:'2026-11-17'};
let summary=ledger.summary(v,p,'payday');
assert.equal(summary.wifeSpent,40000);
assert.equal(summary.selfSpent,6000);
assert.equal(summary.wifeBudget,40000);
assert.equal(summary.selfBudget,20000);
assert.equal(summary.rows.length,2);
const presentation=ledger.presentation(v,{...p,basis:'payday',usageRows:[]});
assert.equal(presentation.amount,46000,'Personal amount participates in existing totals');
assert.equal(presentation.items.length,2);
assert.equal(presentation.items.find(x=>x.owner==='wife').amount,40000);
assert.equal(presentation.items.find(x=>x.owner==='self').amount,6000);
assert.ok(presentation.items.find(x=>x.owner==='self').personalCategoryLabel.includes('14,000'),
 'Self allowance remaining must be visible inside native category drilldown');
assert.ok(!('html' in ledger),'Standalone private expense box removed');
assert.ok(!('bind' in ledger),'Standalone private expense form removed');
assert.equal(presentation.matchedConsumption,0);
const duplicate=ledger.presentation(v,{...p,basis:'payday',usageRows:[
 {kind:'purchase',identity:'purchase:0',date:'2026-10-30',amount:6000,
  label:'飲み会',spendingClass:'NORMAL'},
]});
assert.equal(duplicate.matchedConsumption,6000,'Existing source must be excluded from additive sum');
assert.equal(duplicate.matchedOrdinary,6000);
assert.ok(duplicate.matched.has('purchase:0'));
assert.equal(ledger.summary(v,{start:'2026-11-18',end:'2026-12-17'},'payday').selfSpent,0,
 'Future cycle starts with no spending');
ledger.ensure(v);
assert.equal(writes,1,'No duplicate updates when page rerenders');
const old={cashExpenses:[{id:'existing',date:'2026-10-30',description:'厚生費',amount:5600}]};
persisted=clone(old);writes=0;synced=0;
const recovered=ledger.ensure(old);
assert.equal(recovered.cashExpenses.length,1,'Existing welfare source must not be double booked');
assert.equal(recovered.cashExpenses[0].cost_nature,'VARIABLE');
assert.equal(recovered.personalExpenses.length,2);
persisted=clone({cashExpenses:[],purchaseEvents:[{purchase_id:'existing-card',purchase_date:'2026-10-30',merchant_raw:'厚生費',original_amount:5600}]});
const merged=ledger.ensure(persisted);
assert.equal(merged.cashExpenses.length,0,'Same card purchase must not be seeded as cash');
assert.equal(merged.purchaseEvents[0].cost_nature,'VARIABLE');
console.log('PERSONAL_LEDGER_V186_PASS',{wife:summary.wifeSpent,self:summary.selfSpent,
remaining:summary.selfBudget-summary.selfSpent,ordinary:5600});
