'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const st={
 settings:{cash:500000,cashAsOf:'2026-11-21',salary:0},
 masters:{cards:[{id:'jal',name:'JAL/DC系',active:true,paymentMode:'FULL',monthlyBaselineAmount:250000,forecastMode:'BASELINE',closingDay:15,settlementDay:10}],
 fixedExpenses:[
  {id:'washer',name:'洗濯機',cadence:'ANNUAL',dueMonth:12,dueDay:30,amount:120000,expense_scope:'SPECIAL',category:'DAILY_GOODS',paymentRoute:'CARD',paymentCard:'JAL/DC系',forecastEnabled:true,createdAt:'2026-09-08T12:00:00Z'},
  {id:'bike',name:'電動自転車',cadence:'ANNUAL',dueMonth:12,dueDay:16,amount:150000,expense_scope:'SPECIAL',category:'TRANSPORT',paymentRoute:'CARD',paymentCard:'JAL/DC系',forecastEnabled:true,createdAt:'2026-09-16T12:00:00Z'},
  {id:'tax',name:'ふるさと納税',cadence:'ANNUAL',dueMonth:12,dueDay:30,amount:150000,expense_scope:'SPECIAL',category:'TAX',paymentRoute:'CARD',paymentCard:'JAL/DC系',forecastEnabled:true,createdAt:'2026-09-08T12:00:00Z'},
  {id:'ordinary',name:'未実績月額固定費',cadence:'MONTHLY',day:1,amount:80000,expense_scope:'NORMAL',paymentRoute:'CARD',paymentCard:'JAL/DC系',forecastEnabled:true}
 ]},
 events:[],rules:[],overrides:[],cardSettlements:[],cardCashflowOverrides:[{key:'ESTIMATE|JALDC系|2026-12',kind:'ESTIMATE',card:'JAL/DC系',billing_month:'2026-12',date:'2026-12-10',amount:250000}],
 purchaseEvents:[],history:[],assets:{},cashTransactions:[]};
class FixtureDate extends Date{
 constructor(...args){super(...(args.length?args:['2026-11-21T08:00:00Z']))}
 static now(){return Date.parse('2026-11-21T08:00:00Z')}
}
const win={getTreasuryStateRaw:()=>st,addEventListener:()=>{},matchMedia:()=>({matches:false})};
const document={readyState:'loading',addEventListener:()=>{},getElementById:()=>null,querySelector:()=>null,createElement:()=>({setAttribute(){},style:{}}),head:{appendChild(){}}};
const ctx={window:win,document,Date:FixtureDate,Intl,Number,String,Math,Array,Set,Map,Object,JSON,Error,Promise,structuredClone,
 setTimeout:()=>0,clearTimeout:()=>{},console};
vm.createContext(ctx);
vm.runInContext('function generated(days=90){return []}; function forecast(days=90){let balance=500000,rows=[];for(const e of generated(days)){balance+=Number(e.amount)||0;rows.push({...e,balance})}return{rows,endBalance:balance}};',ctx);
for(const name of ['cashflow-integration-v41.js','planning-model-v79.js','planning-model-v80.js','card-cycle-v81.js','card-baseline-floor-v94.js'])vm.runInContext(fs.readFileSync(name,'utf8'),ctx,{filename:name});
const api=win.householdCardCycleV81;
function row(ym,rows=api.buildPlan(160).rows){return rows.find(x=>x.card==='JAL/DC系'&&x.billing_month===ym)}
function all(){return Array.from(vm.runInContext('generated(160)',ctx))}
function checkTotals(expected,planned){
 let p=row('2027-02');
 assert.equal(p?.amount,-expected,'Card payment estimate is correct for February');
 assert.equal(p?.scheduled_fixed_total,planned,'Special-only forecast preserved');
 assert.equal(p?.components?.scheduled?.length,planned?Math.round(planned/150000):0, 'placeholder expected count');
}
{
 const p=row('2027-02');
 assert.equal(p.amount,-420000,'Scheduled once-off buys and annual tax preserved beyond ¥250k baseline');
 assert.equal(p.known_purchase_total,0);
 assert.equal(p.scheduled_fixed_total,420000);
 assert.deepEqual(Array.from(p.components.scheduled.map(x=>x.name)).sort(),['ふるさと納税','洗濯機','電動自転車'].sort());
 assert.ok(p.components.scheduled.every(x=>x.planned_type==='SPECIAL'));
 assert.ok(!p.components.scheduled.some(x=>/未実績月額固定費/.test(x.name)));
 assert.equal(row('2026-12').amount,-250000,'The normal forecast floor remains ¥250k');
 assert.equal(row('2027-01').amount,-250000,'The normal forecast floor remains ¥250k');
 const normalized=win.householdCardBaselineFloorV94.normalizeRows([p])[0];
 assert.equal(normalized.amount,-420000,'final floor normalizer retains special planned purchases');
 assert.equal(normalized.scheduled_fixed_total,420000);
 const generatedRows=all();
 assert.equal(row('2027-02',generatedRows).amount,-420000,'actual forecast kernel retains February charge');
 assert.equal(generatedRows.filter(x=>x.master_id==='washer'||x.master_id==='bike'||x.master_id==='tax').length,0,
   'Future card purchases are not also deducted at purchase date');
 assert.equal(generatedRows.filter(x=>x.master_id==='ordinary').length,0,
   'Unposted monthly card fixed costs are not separately debited');
 assert.equal(generatedRows.filter(x=>x.date==='2027-02-10'&&x.type==='CARD_ESTIMATE'&&x.card==='JAL/DC系').length,1,
   'only one card settlement forecast per billing month');
 const planned=api.plannedSpecialForHorizon(120);
 assert.deepEqual(Array.from(planned.map(x=>x.name)).sort(),['ふるさと納税','洗濯機','電動自転車'].sort());
 assert.equal(planned.find(x=>x.name==='電動自転車').spend_date,'2026-12-16');
 assert.equal(planned.find(x=>x.name==='洗濯機').spend_date,'2026-12-30');
 assert.ok(planned.every(x=>x.payment_date==='2027-02-10'));
 assert.equal(api.baselinePreview(5).find(x=>x.card==='JAL/DC系').months.find(m=>m.ym==='2027-02').amount,420000);
 assert.ok(!api.plannedSpecialForHorizon(500).some(x=>x.name==='洗濯機'&&x.spend_date.startsWith('2027-')),
   'one-time appliance purchase must not reappear in 2027');
}
st.purchaseEvents.push({purchase_id:'ordinarycard',card:'MUFG/DC/JAL',purchase_date:'2026-12-09',billing_month:'2027-02',original_amount:200000,category:'FOOD'});
assert.equal(row('2027-02').amount,-620000,'known purchases plus scheduled special expenses exceed standard floor');
st.purchaseEvents.push({purchase_id:'appliance',card:'JAL/DC系',purchase_date:'2026-12-30',billing_month:'2027-02',original_amount:120000,category:'DAILY_GOODS',fixed_expense_master_id:'washer'});
assert.equal(row('2027-02').amount,-620000,'the actual appliance purchase replaces its forecast, not adds twice');
assert.equal(row('2027-02').scheduled_fixed_total,300000);
assert.ok(!api.plannedSpecialForHorizon(120).some(x=>x.name==='洗濯機'));
st.cardCashflowOverrides.push({key:'ESTIMATE|JALDC系|2027-02',kind:'ESTIMATE',card:'JAL/DC系',billing_month:'2027-02',amount:250000});
assert.equal(row('2027-02').amount,-620000,'manual month correction cannot cap a real-plus-planned bill');
st.cardSettlements.push({card:'JAL/DC系',due_date:'2027-02-10',amount:601234});
assert.equal(row('2027-02'),undefined,'settled bill takes precedence over estimate');
assert.equal(api.baselinePreview(5).find(x=>x.card==='JAL/DC系').months.find(m=>m.ym==='2027-02').amount,601234);
const mob=fs.readFileSync('mobile-interaction-v70.js','utf8'),desktop=fs.readFileSync('card-forecast-v49.js','utf8');
assert.match(mob,/未購入の特別費予定（カード）/);
assert.match(mob,/標準額を超える予測分/);
assert.match(desktop,/未購入の特別費予定/);
console.log('CARD_SPECIAL_PURCHASE_FORECAST_V226_PASS');