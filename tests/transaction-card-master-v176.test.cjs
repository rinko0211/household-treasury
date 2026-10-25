'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('semantic-ui-v48.js','utf8');
const cycle=fs.readFileSync('card-cycle-v81.js','utf8');
const mdc=fs.readFileSync('mdc-pdf-delta-v144.js','utf8');
const cards=[
 {id:'card:jal-1',name:'JALカード',active:true,settlementDay:10,closingDay:15,paymentMode:'FULL'},
 {id:'card:d-1',name:'dカード',active:true,settlementDay:10,paymentMode:'FULL'},
 {id:'card:rakuten-1',name:'楽天カード',active:true,settlementDay:27,paymentMode:'FULL'}
];
let st={
 masters:{cards, fixedExpenses:[]},
 purchaseEvents:[
 {purchase_id:'receipt1',purchase_date:'2026-10-24',billing_month:'2026-12',
  merchant_raw:'酸ヶ湯売店',original_amount:500,card:'カード未特定',
  economic_type:'EXPENSE',spending_class:'SPECIAL',category:'TRAVEL',subcategory:'OTHER'},
 {purchase_id:'pdf1',purchase_date:'2026-10-24',billing_month:'2026-12',
  merchant_raw:'PDF売店',original_amount:1850,card:'MUFG/DC/JAL',mdc_import_v144:true,
  pdf_card_identity:'JALカード①',economic_type:'EXPENSE',spending_class:'NORMAL',
  category:'TRAVEL',subcategory:'OTHER'},
 {purchase_id:'receipt2',purchase_date:'2026-10-25',billing_month:'2026-12',
  merchant_raw:'一般Visa店',original_amount:1500,card:'VISA',economic_type:'EXPENSE',
  spending_class:'NORMAL',category:'FOOD',subcategory:'OTHER'}
 ],
 cardBillingLines:[],cardSettlements:[],cashTransactions:[],cashExpenses:[],
 automationRules:[],reviewQueue:[]
};
const fields=new Map(),events=[],tasks=[],alerts=[],listeners={};
class Fake{
 constructor(id=''){this.id=id;this.dataset={};this.events={};this.style={};this.value='';
  this.disabled=false;this._html='';this.children=[];this.next={style:{}};this.remember={style:{}}}
 set innerHTML(s){
  this._html=String(s);
  for(const m of this._html.matchAll(/id="([^"]+)"/g))
   if(!fields.has(m[1]))fields.set(m[1],new Fake(m[1]));
 }
 get innerHTML(){return this._html}
 set textContent(v){this._text=String(v)}
 get textContent(){return this._text||''}
 addEventListener(kind,fn){this.events[kind]=fn}
 querySelector(sel){
  if(sel==='[data-v108-tx-next]')return this.next;
  if(sel==='[data-v108-tx-remember]')return this.remember;
  return null
 }
 click(selector){this.events.click?.({target:{closest:x=>x===selector?{dataset:{}}:null}})}
}
const document={readyState:'loading',body:{appendChild:el=>fields.set(el.id,el)},
 createElement:()=>new Fake(),getElementById:id=>fields.get(id)||null,
 addEventListener:(name,fn)=>{listeners[name]=fn}
};
const window={
 getTreasuryStateRaw:()=>st,addEventListener:()=>{},requestAnimationFrame:()=>{},
 householdSemanticV47:{CATEGORY_DEFS:{TRAVEL:{label:'旅行',subs:['OTHER']},FOOD:{label:'食費',subs:['OTHER']},OTHER:{label:'その他',subs:['OTHER']}}},
 householdExpenseUnifiedV148:{captureEditContext:()=>null,render:()=>{}},
 treasuryRecoverySnapshot:reason=>events.push(['backup',reason]),
 replaceTreasuryState:newState=>{st=JSON.parse(JSON.stringify(newState));events.push(['save']);return true},
 repairTreasuryBankBalances:()=>{},
 setTreasurySaveStatus:()=>{},cloudSyncOnLocalSave:()=>events.push(['sync']),
 renderDashboardV39:()=>{},reconcileRakutenBillingV56:()=>{},alert:msg=>alerts.push(msg),
 householdPlanningV79:{baselineOf:()=>0,forecastMode:()=> 'COMPONENTS'}
};
const context={window,document,Date,Intl,Number,String,Array,Set,Map,Math,JSON,Error,Promise,
 alert:window.alert,crypto:{randomUUID:()=> 'test-id'},setTimeout:fn=>tasks.push(fn),
 structuredClone:v=>JSON.parse(JSON.stringify(v))};
vm.runInNewContext(cycle,context);
vm.runInNewContext(src,context);
const edit=window.openSemanticTransactionEditorV108,cardEdit=window.openIntegratedCardEditorV114;
assert.equal(typeof edit,'function');assert.equal(typeof cardEdit,'function');
function prepareClassification(i){
 edit('purchase',i);
 const modal=fields.get('transactionEditorV108');
 assert.ok(fields.get('transactionCardMasterV176'));
 assert.ok(fields.get('transactionEditorRawV110').innerHTML.includes('登録カードマスター'));
 return modal;
}
let modal=prepareClassification('receipt1');
fields.get('transactionCardMasterV176').value='card:jal-1';
modal.click('[data-v108-tx-save]');
assert.equal(st.purchaseEvents[0].card_master_id,'card:jal-1');
assert.equal(st.purchaseEvents[0].card,'JALカード');
assert.equal(st.purchaseEvents[0].original_amount,500);
assert.equal(st.masters.cards.length,3);
modal=prepareClassification('pdf1');
fields.get('transactionCardMasterV176').value='card:jal-1';
modal.click('[data-v108-tx-save]');
assert.equal(st.purchaseEvents[1].card_master_id,'card:jal-1');
assert.equal(st.purchaseEvents[1].card,'MUFG/DC/JAL','PDF immutable source card label must not change');
const afterPdf=events.filter(x=>x[0]==='save').length;
modal=prepareClassification('pdf1');
fields.get('transactionCardMasterV176').value='card:d-1';
modal.click('[data-v108-tx-save]');
assert.equal(events.filter(x=>x[0]==='save').length,afterPdf,'Wrong issuer must not persist');
assert.ok(alerts.some(x=>x.includes('PDF由来')));
assert.equal(st.purchaseEvents[1].card_master_id,'card:jal-1');
cardEdit('purchase','receipt2');
const importModal=fields.get('transactionCardEditorV114');
assert.ok(fields.get('transactionCardEditorBodyV114').innerHTML.includes('<select id="v114Card"'));
fields.get('v114Card').value='card:rakuten-1';
fields.get('v114Date').value='2026-10-25';
fields.get('v114Merchant').value='一般Visa店';
fields.get('v114Amount').value='1500';
fields.get('v114Month').value='2026-12';
importModal.click('[data-v114-card-save]');
assert.equal(st.purchaseEvents[2].card_master_id,'card:rakuten-1');
assert.equal(st.purchaseEvents[2].card,'楽天カード');
assert.equal(st.purchaseEvents[2].original_amount,1500);
assert.equal(st.masters.cards.length,3,'Do not invent or change the registered masters');
const d=st.masters.cards.find(x=>x.id==='card:d-1');
const forecast=window.householdCardCycleV81.buildPlan(400);
assert.ok(forecast.rows.some(x=>x.card==='JALカード'&&x.known_purchase_total===2350),
 'PDF-origin and receipt linked to one master must contribute to the same predicted bill');
assert.ok(forecast.rows.some(x=>x.card==='楽天カード'&&x.known_purchase_total===1500));
assert.ok(!forecast.rows.some(x=>x.card===d.name&&x.known_purchase_total>0),
 'Ambiguous MUFG/DC/JAL PDF must not leak to unrelated D card');
assert.ok(mdc.includes('linkedJal'),'Confirmed JAL QUICPay receipts must remain eligible for PDF dedup');
assert.ok(!src.includes('<input id="v114Card"'),'Free text should not be used for master linking');
console.log('TRANSACTION_CARD_MASTER_V176_PASS');