'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('family/family.js','utf8');
class Node{
 constructor(){this.style={};this.hidden=false;this._text='';this.events={};this.children=[];this.className='';this.attrs={};this.classList={toggle:()=>{}}}
 set textContent(s){this._text=String(s);this.children=[]}
 get textContent(){return this._text+this.children.map(c=>c.textContent).join('')}
 setAttribute(k,v){this.attrs[k]=String(v)}
 addEventListener(k,fn){this.events[k]=fn}
 append(...a){this.children.push(...a)}
 replaceChildren(...a){this._text='';this.children=[...a]}
}
const ids=Object.fromEntries(('status period spent spentTitle rolloverNoticeV223 budgetSection budgetEmpty budget remaining remainLabel progressFill budgetMeter budgetRatio calendarMeter calendarFill elapsedRatio paceEvaluation paceTitle paceDetail dailyGuide dailyPace categories caution cautionText updated refresh legacyHint publishedBadgeV183 publishedTimeV183 publishedStaleV183 familyShareMessagePanelV215 familyShareMessageTextV215').split(' ').map(id=>[id,new Node()]));
const document={getElementById:id=>ids[id],createElement:()=>new Node(),addEventListener:()=>{},hidden:false};
let clock='2026-11-17T14:59:59Z';
class FixtureDate extends Date{constructor(...a){super(...(a.length?a:[clock]))} static now(){return Date.parse(clock)}}
let data={budget:270000,published_at:'2026-11-17T12:00:00Z',
 snapshot:{schema_version:2,period_start:'2026-10-16',period_end:'2026-11-17',variable:242000,undetermined:100,review_count:1,note:'公開済みのひとこと',categories:[]}};
const requests=[];
vm.runInNewContext(src,{document,location:{hash:'#'+'a'.repeat(64)},fetch:async(_url,opts)=>{
 requests.push(JSON.parse(opts.body));return {ok:true,json:async()=>structuredClone(data)};
},setInterval:()=>{},Intl,Date:FixtureDate,Number,String,Array,JSON,Error,Promise});
async function refresh(t){clock=t;ids.refresh.events.click();await new Promise(r=>setImmediate(r))}
function period(){return ids.period.textContent.replaceAll('/','-')}
async function main(){
 await new Promise(r=>setImmediate(r));
 assert.equal(period(),'2026-10-16 〜 2026-11-17');
 assert.equal(ids.spent.textContent,'￥242,000');
 assert.equal(ids.rolloverNoticeV223.hidden,true);
 assert.equal(ids.familyShareMessageTextV215.textContent,'公開済みのひとこと');
 await refresh('2026-11-17T15:00:00Z'); // exactly 11/18 00:00 JST
 assert.equal(period(),'2026-11-18 〜 2026-12-17');
 assert.equal(ids.spent.textContent,'￥0');
 assert.equal(ids.budget.textContent,'￥270,000');
 assert.equal(ids.remaining.textContent,'￥270,000');
 assert.match(ids.remainLabel.textContent,/未反映/);
 assert.match(ids.rolloverNoticeV223.textContent,/まだ反映されていません/);
 assert.equal(ids.rolloverNoticeV223.hidden,false);
 assert.equal(ids.dailyGuide.hidden,true);
 assert.match(ids.paceEvaluation.className,/neutral/);
 assert.equal(ids.familyShareMessageTextV215.textContent,'公開済みのひとこと');
 assert.match(ids.updated.textContent,/前サイクル/);
 assert.match(ids.publishedTimeV183.textContent,/21:00/);
 assert.equal(data.snapshot.variable,242000,'No server-side or source mutation');
 // Manual publication replaces placeholder immediately.
 data.snapshot={...data.snapshot,period_start:'2026-11-18',period_end:'2026-12-17',variable:1234,note:'新しい公開文',undetermined:0,review_count:0};
 data.published_at='2026-11-18T01:00:00Z';
 await refresh('2026-11-18T02:00:00Z');
 assert.equal(ids.spent.textContent,'￥1,234');
 assert.equal(ids.rolloverNoticeV223.hidden,true);
 assert.equal(ids.familyShareMessageTextV215.textContent,'新しい公開文');
 assert.equal(ids.updated.textContent.startsWith('妻へ反映'),true);
 // Weekend adjustment: Jan 18 2027 Monday, Feb 18 Thursday.
 await refresh('2027-01-18T00:00:00Z');
 assert.equal(period(),'2027-01-18 〜 2027-02-17');
 // April 18 2027 Sunday -> preceding Friday.
 await refresh('2027-04-16T00:00:00Z');
 assert.equal(period(),'2027-04-16 〜 2027-05-17');
 // Nondefault schedules never invent an incorrect rollover.
 data.snapshot={...data.snapshot,period_start:'2026-10-01',period_end:'2026-10-30',variable:999};
 await refresh('2026-11-18T00:00:00Z');
 assert.equal(period(),'2026-10-01 〜 2026-10-30');
 assert.equal(ids.spent.textContent,'￥999');
 assert.ok(requests.every(r=>r.action==='view'),'Family view remains read-only');
 console.log('FAMILY_CYCLE_ROLLOVER_V223_PASS');
}
main().catch(e=>{console.error(e);process.exitCode=1});
