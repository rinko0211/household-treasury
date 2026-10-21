// node tests/verified-correction-v149.test.js
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const program=fs.readFileSync('verified-correction-patch-v149.js','utf8');
const copy=x=>JSON.parse(JSON.stringify(x));
let checks=0;const eq=(a,b,label)=>{assert.equal(a,b,label);checks++},ok=(v,label)=>{assert.ok(v,label);checks++};
const old={card:'Test Card',purchase_id:'old-a',purchase_date:'2026-10-01',merchant_raw:'TEST SHOP',
 original_amount:300,billing_month:'2026-11',occurrence_index:1,source_file:'old-source',
 pdf_card_identity:'legacy-alias'};
const newer={...old,purchase_id:'new-a',source_file:'new-source',pdf_card_identity:'stable-alias'};
const another={...old,purchase_id:'unrelated',purchase_date:'2026-10-02',original_amount:999};
const bank={id:'bank-1',date:'2026-10-10',amount:-300,balance_after:120000};
const patch={
 format:'household-treasury-jaldc-duplicate-correction-v1',expectedRemovedCount:1,expectedRemovedAmount:300,
 removals:[{purchase_id:'old-a',replacement_purchase_id:'new-a',card:'Test Card',
 purchase_date:'2026-10-01',billing_month:'2026-11',original_amount:300,occurrence_index:1,
 merchant_raw:'TEST SHOP',source_file:'old-source',pdf_card_identity:'legacy-alias'}]
};
let state={purchaseEvents:[old,newer,another],cashTransactions:[bank],settings:{cash:120000},assets:{bank:120000},
 imports:[{sha256:'test-file-sha'}],cardSettlements:[{amount:300,card:'Test Card'}]};
const before=copy(state),snapshots=[],sent=[];
const window={
 getTreasuryStateRaw:()=>state,
 treasuryRecoverySnapshot:label=>{snapshots.push({label,state:copy(state)});return true},
 replaceTreasuryState:v=>{state=copy(v);return true},
 cloudSyncOnLocalSave:()=>sent.push('sync'),
 dispatchEvent:()=>{},
 setTreasurySaveStatus:()=>{},
 addEventListener:()=>{}
};
const document={readyState:'loading',addEventListener:()=>{},getElementById:()=>null,querySelector:()=>null};
vm.runInNewContext(program,{window,document,setTimeout:()=>{},CustomEvent:class{},Intl,JSON,Map,Set,Number,Error,String});
const api=window.householdVerifiedCorrectionPatchV149;
ok(api,'API loaded');
const dry=api.plan(state,patch);
eq(dry.removed,1,'Exactly one duplicate');
eq(dry.removedAmount,300,'Deleted amount matches');
eq(dry.alreadyResolved,0,'Pending count');
const done=api.apply(patch);
eq(done.saved,true,'Persistence successful');
eq(state.purchaseEvents.length,2,'One row removed');
eq(state.purchaseEvents.some(x=>x.purchase_id==='new-a'),true,'Correct original remains');
eq(state.purchaseEvents.some(x=>x.purchase_id==='unrelated'),true,'Unrelated purchase unaffected');
eq(state.cashTransactions[0].balance_after,120000,'Bank balance preserved');
eq(state.assets.bank,120000,'Asset snapshot preserved');
eq(state.cardSettlements.length,1,'Settlement preserved');
eq(state.imports.length,1,'Import hashes preserved');
eq(snapshots.length,1,'Predelete backup saved');
eq(sent.length,1,'Cloud sync requested');
eq(api.apply(patch).saved,false,'Safe repeat is no-op');
eq(state.purchaseEvents.length,2,'Repeat does not delete new original');
const forged=copy(patch);forged.removals[0].original_amount=301;forged.expectedRemovedAmount=301;
assert.throws(()=>api.plan(before,forged));checks++;
const missingReplacement=copy(before);missingReplacement.purchaseEvents=missingReplacement.purchaseEvents.filter(x=>x.purchase_id!=='new-a');
assert.throws(()=>api.plan(missingReplacement,patch));checks++;
const sameFile=copy(before);sameFile.purchaseEvents[1].source_file='old-source';
assert.throws(()=>api.plan(sameFile,patch));checks++;
const swapped=copy(before);swapped.purchaseEvents[0].merchant_raw='NOT THE SAME';
assert.throws(()=>api.plan(swapped,patch));checks++;
const wrongCount=copy(patch);wrongCount.expectedRemovedCount=2;
assert.throws(()=>api.plan(before,wrongCount));checks++;
console.log('PASS '+checks+' privacy-preserving correction-patch assertions');
