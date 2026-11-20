'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const st={settings:{},masters:{cards:[
{id:'jal',name:'JALカード',monthlyBaselineAmount:250000,forecastMode:'BASELINE',closingDay:15,settlementDay:10},
{id:'d',name:'Dカード',monthlyBaselineAmount:20000,forecastMode:'BASELINE',settlementDay:10,closingDay:15},
{id:'rak',name:'楽天カード',monthlyBaselineAmount:10000,forecastMode:'BASELINE',closingDay:30,settlementDay:27},
{id:'other',name:'その他カード',monthlyBaselineAmount:0,settlementDay:10,closingDay:15}],
fixedExpenses:[{id:'f',name:'未実績固定費',amount:80000,day:1,paymentCard:'JALカード',paymentRoute:'CARD',cadence:'MONTHLY'},
{id:'f2',name:'未実績固定費2',amount:9999,day:1,paymentCard:'その他カード',paymentRoute:'CARD',cadence:'MONTHLY'}]},
purchaseEvents:[],cardSettlements:[],cardCashflowOverrides:[],rules:[],events:[]};
class FixtureDate extends Date{constructor(...a){super(...(a.length?a:['2026-11-20T10:00:00Z']))}static now(){return Date.parse('2026-11-20T10:00:00Z')}}
const win={getTreasuryStateRaw:()=>st,addEventListener:()=>{}};
const ctx={window:win,document:{addEventListener(){},querySelector:()=>null,createElement:()=>({setAttribute(){}}),head:{appendChild(){}}},Date:FixtureDate,Intl,Number,String,Math,Array,Set,Map,Object,JSON,Error,Promise,structuredClone,setTimeout:()=>0,clearTimeout:()=>{},console};
vm.createContext(ctx);
vm.runInContext('function generated(){return [];}',ctx);
for(const file of ['planning-model-v79.js','planning-model-v80.js','card-cycle-v81.js','card-baseline-floor-v94.js'])vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
function add(card,amount,id,ym='2026-12',extra={}){st.purchaseEvents.push({purchase_id:id,card,original_amount:amount,billing_month:ym,purchase_date:'2026-11-10',...extra})}
function get(rows,card){return rows.find(r=>r.card===card&&r.billing_month==='2026-12')}
function expect(card,amount){
 for(const rows of [win.householdCardCycleV81.buildPlan(90).rows,win.householdCardForecastV49(90).rows,vm.runInContext('generated(90)',ctx),win.householdCardCycleV81.buildPlan(90,'2026-11-01').rows]){
 const r=get(rows,card);assert.equal(r?.amount,-amount,card+' '+JSON.stringify(r));assert.equal(r.scheduled_fixed_total,0);assert.equal(r.components.scheduled.length,0);
 }
}
add('JALカード',230000,'j1');expect('JALカード',250000);
add('JALカード',60000,'j2');expect('JALカード',290000);
add('JALカード',100000,'dup','2026-12',{count_in_spending:false,reconciliation_status:'ABSORBED_DUPLICATE'});expect('JALカード',290000);
add('JALカード',20000,'wife','2026-12',{count_in_spending:false,wife_card_claim_preserved_v205:true,reference_only_v200:true,personal_owner_v193:'wife'});expect('JALカード',310000);
add('Dカード',35000,'d1');expect('Dカード',35000);
add('楽天カード',5900,'r1');add('楽天カード',1980,'r2');add('楽天カード',4769,'r3');expect('楽天カード',12649);
add('その他カード',5000,'o1');expect('その他カード',5000);
st.cardCashflowOverrides.push({kind:'ESTIMATE',card:'JALカード',billing_month:'2026-12',amount:250000});expect('JALカード',310000);
st.cardCashflowOverrides[0].amount=330000;expect('JALカード',330000);
assert.equal(win.householdCardCycleV81.baselinePreview().find(c=>c.card==='JALカード').months.find(m=>m.ym==='2026-12').amount,330000);
st.cardSettlements.push({card:'JALカード',due_date:'2026-12-10',amount:301000});
for(const rows of [win.householdCardCycleV81.buildPlan(90).rows,win.householdCardForecastV49(90).rows,vm.runInContext('generated(90)',ctx)])assert.equal(get(rows,'JALカード'),undefined,'confirmed statement suppresses estimate');
assert.equal(win.householdCardCycleV81.baselinePreview().find(c=>c.card==='JALカード').months.find(m=>m.ym==='2026-12').amount,301000);
const old={card:'楽天カード',billing_month:'2026-12',date:'2026-12-27',amount:-80000,type:'CARD_ESTIMATE',known_purchase_total:12649,scheduled_fixed_total:67351,components:{purchases:[],scheduled:[{amount:67351}]}};
assert.equal(win.householdCardBaselineFloorV94.normalizeRows([old])[0].amount,-12649);
console.log('CARD_ACTUAL_FLOOR_V225_PASS');
