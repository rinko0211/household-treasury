'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('family/index.html','utf8');
const css=fs.readFileSync('family/family.css','utf8');
const src=fs.readFileSync('family/family.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');
for(const id of ['budgetMeter','progressFill','budgetRatio','calendarMeter','calendarFill','elapsedRatio','paceEvaluation','paceTitle','paceDetail']){
 assert.ok(html.includes('id="'+id+'"'),'Missing pace control: '+id);
}
assert.ok(html.indexOf('id="budgetMeter"')<html.indexOf('id="calendarMeter"'),'Spending bar must be above day bar');
assert.ok(html.includes('family.js?v=174')&&html.includes('family.css?v=174'));
assert.ok(sw.includes('./family/family.js?v=174')&&sw.includes('./family/family.css?v=174'));
assert.ok(css.includes('.pace-evaluation.is-behind')&&css.includes('.pace-evaluation.is-balanced')&&css.includes('.pace-evaluation.is-ahead'));
assert.ok(css.includes('.calendar-progress>div{background:#8999a9}'),'Calendar bar must have a consistent neutral color');
class Node{
 constructor(){
  this.style={};this.className='';this.hidden=false;this.attributes={};this.events={};
  this.children=[];this._text='';this.classList={toggle:()=>{}};
 }
 set textContent(v){this._text=String(v);this.children=[]}
 get textContent(){return this._text+this.children.map(x=>x.textContent).join('')}
 setAttribute(k,v){this.attributes[k]=String(v)}
 addEventListener(k,fn){this.events[k]=fn}
 append(...a){this.children.push(...a)}
 replaceChildren(...a){this.children=a;this._text=''}
}
const ids=Object.fromEntries([
 'status','period','spent','budgetSection','budgetEmpty','budget','remaining','remainLabel',
 'progressFill','budgetMeter','budgetRatio','remainingRatio','calendarMeter','calendarFill',
 'elapsedRatio','paceEvaluation','paceTitle','paceDetail','daysLeft','dailyPace',
 'categories','caution','cautionText','updated','refresh','legacyHint'
].map(id=>[id,new Node()]));
const document={getElementById:id=>ids[id]||null,createElement:()=>new Node(),addEventListener:()=>{},hidden:false};
let current='2026-10-10T06:00:00Z';
const RealDate=Date;
class FixedDate extends RealDate{
 constructor(...a){super(...(a.length?a:[current]))}
 static now(){return RealDate.parse(current)}
}
let spent=0,budget=100000,periodStart='2026-10-01',periodEnd='2026-10-30';
const fetch=async()=>({ok:true,json:async()=>({
 snapshot:{schema_version:2,period_start:periodStart,period_end:periodEnd,variable:spent,categories:[]},
 budget,published_at:current
})});
vm.runInNewContext(src,{
 document,location:{hash:'#'+'a'.repeat(64)},fetch,setInterval:()=>{},
 Intl,Date:FixedDate,Number,String,Array,JSON,Error,Promise
});
async function show(value,day='2026-10-10',limit=100000){
 spent=value;budget=limit;current=day+'T06:00:00Z';
 ids.refresh.events.click();
 for(let i=0;i<10;i++)await Promise.resolve();
 return {status:ids.paceTitle.textContent,detail:ids.paceDetail.textContent,
  className:ids.paceEvaluation.className,calendar:ids.calendarFill.style.width,
  spending:ids.progressFill.style.width,elapsed:ids.elapsedRatio.textContent};
}
async function test(){
 let x=await show(21000);
 assert.equal(x.status,'余裕あり！');
 assert.equal(x.calendar,'33%');assert.equal(x.spending,'21%');
 assert.ok(x.className.includes('is-behind'));assert.ok(x.detail.includes('4日分'));
 x=await show(27000); // 8 budget days vs 10 elapsed, exactly -2.
 assert.equal(x.status,'ちょうどいい感じ！');
 x=await show(33000); // ~10 budget days vs 10 elapsed.
 assert.equal(x.status,'ちょうどいい感じ！');
 x=await show(40000); // 12 budget days vs 10 elapsed, exactly +2.
 assert.equal(x.status,'ちょうどいい感じ！');
 x=await show(43000); // 13 budget days vs 10 elapsed, exactly +3.
 assert.equal(x.status,'ちょい多めかも');
 assert.ok(x.className.includes('is-ahead'));assert.ok(x.detail.includes('3日分'));
 x=await show(101000); // Actual budget exceed takes priority.
 assert.equal(x.status,'ちょい多めかも');
 assert.ok(x.detail.includes('予算を超えて'));assert.equal(x.spending,'100%');
 x=await show(21000,'2026-09-30');
 assert.equal(x.status,'サイクル開始前です');assert.equal(x.calendar,'0%');
 x=await show(21000,'2026-10-31');
 assert.equal(x.status,'このサイクルは終了しました');assert.equal(x.calendar,'100%');
 x=await show(21000,'2026-10-10',0);
 assert.equal(ids.budgetSection.hidden,true,'No budget means no misleading pace rating');
 periodStart='2026-10-16';periodEnd='2026-11-17';
 x=await show(21000,'2026-10-24');
 assert.ok(x.elapsed.includes('9日 / 33日'),'Inclusive cycle day count must use full actual period');
 assert.equal(x.calendar,'27%');
 assert.ok(!src.includes("location.hash =")&&!src.includes("localStorage.setItem("),'Viewer must remain read-only');
 console.log('FAMILY_BUDGET_PACE_V174_PASS');
}
test().catch(e=>{console.error(e);process.exitCode=1});