'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('repair-import-unified-v161.js','utf8');
const actions=[];
const window={
 getTreasuryStateRaw:()=>({cashExpenses:[],purchaseEvents:[]}),
 householdPaymentReclassV159:{plan:(_,patch)=>{actions.push('preview-payment');return{changed:patch.entries.length,total:1000}},apply:()=>{actions.push('apply-payment');return{changed:1}}},
 householdVerifiedCorrectionPatchV149:{plan:(_,patch)=>{actions.push('preview-duplicate');return{removed:patch.removals.length,removedAmount:2500}},apply:()=>{actions.push('apply-duplicate');return{removed:1}}},
 householdCycleAuditV153:{planPatch:(_,patch)=>{actions.push('preview-cycle');return{changed:patch.updates}},applyPatch:()=>{actions.push('apply-cycle');return{changed:['x']}}},
 addEventListener:()=>{},confirm:()=>true
};
const document={readyState:'loading',addEventListener:()=>{},getElementById:()=>null,querySelector:()=>null};
vm.runInNewContext(source,{window,document,Intl,Number,Map,Object,Array,Error,String});
const desk=window.householdUnifiedRepairDeskV161;
assert.ok(desk,'Unified correction desk exported');
assert.equal(desk.formats().length,3,'Three legacy formats are available in one common picker');
const input=[
 {format:'HOUSEHOLD_TREASURY_PAYMENT_RECLASS_V159',entries:[{}]},
 {format:'household-treasury-jaldc-duplicate-correction-v1',removals:[{}]},
 {format:'household-treasury-cycle-reconciliation-v153',updates:[{}]}
];
for(const patch of input){
 const p=desk.inspect(patch);assert.equal(p.detail.count,1);
 const decline=desk.applyValidated(patch,()=>false);assert.equal(decline.cancelled,true);
 const result=desk.applyValidated(patch,()=>true);assert.equal(result.count,1);
}
assert.deepEqual(actions.filter(x=>x.startsWith('apply-')),['apply-payment','apply-duplicate','apply-cycle']);
assert.throws(()=>desk.inspect({format:'backup',cashExpenses:[]}),/未対応/);
assert.throws(()=>desk.inspect({format:''}),/未対応/);
desk.register({format:'future-safe-format',label:'future',preview:()=>({count:0}),apply:()=>{}});
assert.ok(desk.formats().includes('future-safe-format'),'Next versions share the same desk through registration');
assert.equal(desk.applyValidated({format:'future-safe-format'},()=>true).alreadyApplied,true);
assert.throws(()=>desk.register({format:'future-safe-format',label:'other',preview:()=>({count:0}),apply:()=>{}}),/重複/);
for(const oldPath of ['payment-reclass-patch-v159.js','verified-correction-patch-v149.js','cycle-audit-reconciliation-v153.js']){
 const old=fs.readFileSync(oldPath,'utf8');
 assert.ok(old.includes('function mount(){')||old.includes('function mount()'),oldPath+' engine retained');
}
const html=fs.readFileSync('index.html','utf8'),sw=fs.readFileSync('sw.js','utf8');
assert.ok(html.includes('repair-import-unified-v161.js?v=161'));
assert.ok(sw.includes('./repair-import-unified-v161.js?v=161'));
assert.ok(!fs.readFileSync('sync-state-sanitizer-v22.js','utf8').includes("injectClassic('./expense-tab-v130.js"),'No old expense renderer injection');
console.log('UNIFIED_REPAIR_V161_PASS');
