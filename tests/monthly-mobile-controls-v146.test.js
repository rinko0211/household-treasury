// Execute: node tests/monthly-mobile-controls-v146.test.js
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ledger=fs.readFileSync('treasury-ledger-v145.js','utf8');
const ui=fs.readFileSync('monthly-treasury-v142.js','utf8');
class Classes{constructor(){this.values=new Set()}add(x){this.values.add(x)}remove(x){this.values.delete(x)}contains(x){return this.values.has(x)}}
const nodes=new Map();
class Element{
 constructor(id){this.id=id;this.classList=new Classes();this.dataset={};this.attributes={};this._html='';this.textContent='';this.value=''}
 set innerHTML(s){this._html=String(s);for(const m of this._html.matchAll(/id="([^"]+)"/g))if(!nodes.has(m[1]))nodes.set(m[1],new Element(m[1]))}
 get innerHTML(){return this._html}
 setAttribute(k,v){this.attributes[k]=v}
}
const tab=new Element('monthlyTreasuryTabV142'),expenses=new Element('expenses'),
 nav=new Element('nav'),eTab=new Element('expenseTab'),dashboard=new Element('dashboard');
tab.dataset.page='monthlyTreasuryPageV142';
expenses.parentNode={insertBefore:node=>nodes.set(node.id,node)};
[tab,expenses,eTab,dashboard].forEach(n=>nodes.set(n.id,n));
const document={
 readyState:'complete',getElementById:id=>nodes.get(id)||null,createElement:id=>new Element(id),
 querySelector:q=>q==='nav.tabs'?nav:null,
 querySelectorAll:q=>q==='nav.tabs .tab'?[tab,eTab]:q==='section.page'?
   [expenses,dashboard,nodes.get('monthlyTreasuryPageV142')].filter(Boolean):[],
 addEventListener:()=>{}
};
const events={},state={settings:{salaryDay:18,salary:540000,cash:50000},
 cashTransactions:[],cashExpenses:[],purchaseEvents:[],cardSettlements:[],
 masters:{fixedExpenses:[],cards:[]},rules:[],events:[]};
const window={
 getTreasuryStateRaw:()=>state,
 addEventListener:(name,callback)=>(events[name]??=[]).push(callback),
 dispatchEvent:event=>(events[event.type]||[]).forEach(fn=>fn(event))
};
class CustomEvent{constructor(type,{detail}){this.type=type;this.detail=detail}}
const context={window,document,CustomEvent,Intl,Date,Number,Math,Map,Set,Array,String,JSON,Error};
vm.runInNewContext(ledger,context);
vm.runInNewContext(ui,context);
let count=0;const ok=(x,msg)=>{assert.ok(x,msg);count++};
const $=id=>nodes.get(id);
ok(typeof tab.onclick==='function','Monthly nav is clickable');
tab.onclick();
ok($('monthlyTreasuryPageV142').classList.contains('active'),'Tab activates content');
ok($('treasuryBasisV145').value==='payday','Default payroll cycle');
ok($('treasuryPeriodNoteV145').textContent.includes('2026-10-16')||
   $('treasuryPeriodNoteV145').textContent.includes('前倒し'),'Payroll calculation rendered');
$('treasuryMonthV145').onchange({target:{value:'2026-09'}});
ok($('treasuryMonthV145').value==='2026-09','Selected historical month');
$('treasuryCycleCalendarV146').onclick();
ok($('treasuryBasisV145').value==='calendar','Calendar button works');
ok($('treasuryMonthV145').value==='2026-09','Historical month is preserved');
ok($('treasuryPeriodNoteV145').textContent.includes('2026-09-01'),'Calendar start changed');
ok($('treasuryCycleCalendarV146').attributes['aria-pressed']==='true','Button has selected status');
$('treasuryCyclePaydayV146').onclick();
ok($('treasuryBasisV145').value==='payday','Payroll button works');
ok($('treasuryPeriodNoteV145').textContent.includes('2026-09-18'),'Payday period restored');
$('treasuryLensEconomicV146').onclick();
ok($('treasuryLensV145').value==='economic','Economic lens button works');
ok($('treasuryKpisV145').innerHTML.includes('生活上の消費支出'),'Visible data changed');
$('treasuryLensCashV146').onclick();
ok($('treasuryLensV145').value==='cash','Cash lens restored');
ok($('treasuryKpisV145').innerHTML.includes('実際の資金流出'),'Cash view rendered');
console.log('PASS '+count+' mobile monthly controls v146 assertions');
