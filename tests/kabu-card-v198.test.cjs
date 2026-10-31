'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const crypto=require('node:crypto');
const {parseCsvV73}=require('../csv-parser-v73.js');
const code=fs.readFileSync('kabu-card-v44.js','utf8');
const date=x=>{const t=String(x||'');const m=t.match(/^(\d{4})[\/-](\d\d?)[\/-](\d\d?)$/);
 return m?m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0'):t};
const normalized=s=>String(s||'').normalize('NFKC').replace(/[\s　]+/g,'').toUpperCase();
const amount=x=>{const a=String(x||'').replace(/[￥¥,\s]/g,'');return /^[-+]?\d+$/.test(a)?Number(a):null};
const hash32=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return(h>>>0).toString(16)};
const csv=(entries,due='2026/11/27',method='一括')=>{
 const lines=[['今回のお支払日',due],['今回のお支払金額合計',String(entries.reduce((v,x)=>v+Number(x[2]),0))],
 ['ご利用日','ご利用先など','ご利用金額(￥)','お支払い金額(￥)','支払区分','国内／海外','摘要'],
 ...entries.map(x=>[x[0],x[1],String(x[2]),String(x[2]),x[3]||method,'国内',''])];
 return lines.map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n')+'\r\n';
};
function env(){
 const state={purchaseEvents:[],cashExpenses:[],cashTransactions:[],cardSettlements:[],imports:[],reviewQueue:[]};
 const win={getTreasuryStateRaw:()=>state,confirm:()=>true};
 let backups=0,writes=0,renders=0;
 win.treasuryRecoverySnapshot=()=>{backups++};
 win.replaceTreasuryState=next=>{for(const key of Object.keys(state))delete state[key];
   Object.assign(state,structuredClone(next));writes++;return true};
 win.cloudSyncOnLocalSave=()=>{};
 win.householdExpenseUnifiedV148={render:()=>{renders++}};
 const context={window:win,state,parseCsv:parseCsvV73,parseDate:date,number:amount,normalizeText:normalized,
  hash32,rowObj:(h,r)=>Object.fromEntries(h.map((x,i)=>[x,r[i]||''])),
  classifyMerchant:()=>({category:'FOOD',ordinary_or_special:'ORDINARY',confidence:.9}),
  addReview:r=>state.reviewQueue.push(r),
  detectSource:()=>({type:'unknown',text:''}),
  importOne:async()=>({source:'ORIGINAL'}),
  fileHash:async buf=>crypto.createHash('sha256').update(Buffer.from(buf)).digest('hex'),
  save:()=>{},TextDecoder,Uint8Array,Array,Object,Map,Set,Math,Date,Number,String,JSON,Intl,
  console,structuredClone};
 vm.createContext(context);vm.runInContext(code,context,{filename:'kabu-card-v44.js'});
 const parse=(text,name='kabu-2026.csv')=>win.parseKabuCardV44({text},{name});
 const load=(text,name)=>({name,arrayBuffer:async()=>{
  const buf=Buffer.from(text,'utf8');return buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength)}});
 return {state,context,win,parse,load,get backups(){return backups},get writes(){return writes},get renders(){return renders}};
}
const a=['2026/10/19','スーパーK',1490];
const b=['2026/10/20','珈琲店',410];
test('statement month and renamed file do not repeat the same KABU purchase',()=>{
 const e=env();
 const first=e.parse(csv([a,b]),'kabu-oct.csv');
 assert.equal(first.added,2);
 const canonical=e.state.purchaseEvents[0];
 const next=e.parse(csv([[...a.slice(0,3),'１回払い'],b],'2026/12/27','１回払い'),'kabu-nov.csv');
 assert.equal(next.added,0);
 assert.equal(next.duplicates,2);
 assert.equal(e.state.purchaseEvents.length,2);
 assert.equal(e.state.purchaseEvents[0],canonical,'Canonical purchase unchanged');
 assert.equal(canonical.billing_month,'2026-11');
 assert.equal(e.state.cardSettlements.length,2,'Separate statement payments are retained');
 assert.equal(e.win.householdKabuCardV198.scanDuplicates(e.state).length,0);
});
test('legitimate identical purchases on the same day retain two occurrences',()=>{
 const e=env();
 const results=e.parse(csv([a,a]),'two-charges.csv');
 assert.equal(results.added,2);
 assert.deepEqual([...e.state.purchaseEvents.map(x=>x.occurrence_index)],[1,2]);
 assert.notEqual(e.state.purchaseEvents[0].purchase_id,e.state.purchaseEvents[1].purchase_id);
 const another=e.parse(csv([a,a],'2026/12/27','１回'),'overlap.csv');
 assert.equal(another.added,0);
 assert.equal(another.duplicates,2);
 assert.equal(e.win.householdKabuCardV198.scanDuplicates(e.state).length,0);
});
test('manually registered KABU transactions cannot suppress canonical statement import',()=>{
 const e=env();
 e.state.purchaseEvents.push({purchase_id:'manual-receipt-1',card:'KABU&',
   source_file:'CHAT_REPORTED.csv',purchase_date:'2026-10-19',
   merchant_raw:'スーパーK',original_amount:1490,
   payment_method:'カード'});
 const imported=e.parse(csv([a]));
 assert.equal(imported.added,1);
 assert.equal(e.state.purchaseEvents.length,2);
 const candidates=e.win.householdKabuCardV198.scanDuplicates(e.state);
 assert.equal(candidates.length,1);
 assert.equal(candidates[0].kind,'manual_purchase');
 assert.equal(candidates[0].index,0);
 assert.equal(candidates[0].canonicalIndex,1);
 e.win.confirm=()=>false;
 assert.equal(e.win.householdKabuCardV198.applyDuplicate('manual_purchase:0').cancelled,true);
 assert.equal(e.state.purchaseEvents[0].count_in_spending,undefined);
 e.win.confirm=()=>true;
 const result=e.win.householdKabuCardV198.applyDuplicate('manual_purchase:0');
 assert.equal(result.suppressed,1);
 assert.equal(e.state.purchaseEvents[0].count_in_spending,false);
 assert.equal(e.state.purchaseEvents[0].reconciliation_status,'ABSORBED_DUPLICATE');
 assert.equal(e.state.purchaseEvents[1].count_in_spending,undefined);
 assert.ok(e.backups>0&&e.writes>0&&e.renders>0);
 assert.equal(e.win.householdKabuCardV198.scanDuplicates(e.state).length,0);
 assert.equal(e.win.householdKabuCardV198.excludedDuplicates(e.state).length,1);
 const restored=e.win.householdKabuCardV198.restoreDuplicate('purchase:0');
 assert.equal(restored.restored,1);
 assert.equal(e.state.purchaseEvents[0].count_in_spending,undefined);
 assert.equal(e.state.purchaseEvents[0].reconciliation_status,undefined);
 assert.equal(e.win.householdKabuCardV198.excludedDuplicates(e.state).length,0);
 assert.equal(e.win.householdKabuCardV198.scanDuplicates(e.state).length,1);
});
test('import-only historical duplicate is reviewable, never physically deleted',()=>{
 const e=env();
 e.parse(csv([a]),'original-kabu.csv');
 const first=e.state.purchaseEvents[0];
 e.state.purchaseEvents.push({...first,purchase_id:'kabu:old-file-variation:1',
   source_file:'second-kabu.csv',billing_month:'2026-12',payment_method:'リボ変更'});
 const proposal=e.win.householdKabuCardV198.scanDuplicates(e.state);
 assert.equal(proposal.length,1);
 assert.equal(proposal[0].kind,'purchase');
 assert.equal(proposal[0].index,1);
 assert.equal(e.win.householdKabuCardV198.applyDuplicate('purchase:1').suppressed,1);
 assert.equal(e.state.purchaseEvents.length,2,'No imported evidence deleted');
 assert.equal(e.state.purchaseEvents[0].purchase_id,first.purchase_id);
 assert.equal(e.state.purchaseEvents[0].count_in_spending,undefined);
 assert.equal(e.state.purchaseEvents[1].count_in_spending,false);
 assert.equal(e.state.purchaseEvents[1].kabu_canonical_purchase_id,first.purchase_id);
 assert.equal(e.win.householdKabuCardV198.scanDuplicates(e.state).length,0);
 assert.equal(e.win.householdKabuCardV198.excludedDuplicates(e.state).length,1);
 assert.equal(e.win.householdKabuCardV198.restoreDuplicate('purchase:1').restored,1);
 assert.equal(e.state.purchaseEvents[1].count_in_spending,undefined);
 assert.equal(e.win.householdKabuCardV198.scanDuplicates(e.state).length,1);
});
test('only explicitly card-tagged cash overlaps are candidates; genuine cash is protected',()=>{
 const e=env();
 e.parse(csv([a]));
 e.state.cashExpenses.push(
  {id:'real-cash',date:'2026-10-19',description:'スーパーK',amount:1490,payment_method:'CASH'},
  {id:'card-cash-manual',date:'2026-10-19',description:'スーパーK',amount:1490,payment_method:'KABU&カード'});
 const plans=e.win.householdKabuCardV198.scanDuplicates(e.state);
 assert.equal(plans.length,1);
 assert.equal(plans[0].kind,'manual_cash');
 assert.equal(plans[0].index,1);
 e.win.householdKabuCardV198.applyDuplicate('manual_cash:1');
 assert.equal(e.state.cashExpenses[0].count_in_spending,undefined,'Actual cash expense not touched');
 assert.equal(e.state.cashExpenses[1].count_in_spending,false);
 assert.equal(e.state.purchaseEvents[0].count_in_spending,undefined);
 assert.equal(e.win.householdKabuCardV198.restoreDuplicate('cash:1').restored,1);
 assert.equal(e.state.cashExpenses[1].count_in_spending,undefined);
 assert.equal(e.state.cashExpenses[0].count_in_spending,undefined);
});
test('different card, date, merchant or amount never treated as KABU overlap',()=>{
 const e=env();
 e.parse(csv([a]));
 const extra=[
  {card:'Rakuten',purchase_date:'2026-10-19',merchant_raw:'スーパーK',original_amount:1490},
  {card:'KABU&',purchase_id:'manual-date',purchase_date:'2026-10-18',merchant_raw:'スーパーK',original_amount:1490},
  {card:'KABU&',purchase_id:'manual-amount',purchase_date:'2026-10-19',merchant_raw:'スーパーK',original_amount:1491},
  {card:'KABU&',purchase_id:'manual-merchant',purchase_date:'2026-10-19',merchant_raw:'スーパーX',original_amount:1490}
 ];
 e.state.purchaseEvents.push(...extra);
 assert.equal(e.win.householdKabuCardV198.scanDuplicates(e.state).length,0);
 assert.throws(()=>e.win.householdKabuCardV198.applyDuplicate('purchase:1'),/重複候補/);
});
test('unmodified source bytes are not imported twice',async()=>{
 const e=env(),data=csv([a]),file=e.load(data,'kabu-card.csv');
 const first=await e.context.importOne(file),again=await e.context.importOne(file);
 assert.equal(first.added,1);
 assert.equal(again.skipped,true);
 assert.equal(e.state.purchaseEvents.length,1);
 assert.equal(e.state.imports.length,1);
});
console.log('KABU_CARD_V198_DUPLICATE_REGRESSION_REGISTERED');


test('Japanese bracket variants of the same KABU subscription are one purchase',()=>{
 const e=env();
 const old=['2026/10/01','ＫＡＢＵ＆（プラス／プレミアム）',500];
 const newer=['2026/10/01','ＫＡＢＵ＆〔プラス／プレミアム〕',500];
 assert.equal(e.parse(csv([old]),'older-export.csv').added,1);
 const again=e.parse(csv([newer],'2026/11/10'),'newer-export.csv');
 assert.equal(again.added,0);
 assert.equal(again.duplicates,1);
 assert.equal(e.state.purchaseEvents.length,1);
 // Previously imported duplicates remain reviewable but never auto deleted.
 e.state.purchaseEvents.push({...e.state.purchaseEvents[0],
   purchase_id:'kabu:legacy-brackets:1',source_file:'legacy.csv',
   merchant_raw:'ＫＡＢＵ＆〔プラス／プレミアム〕'});
 assert.equal(e.win.householdKabuCardV198.scanDuplicates(e.state).length,1);
});
