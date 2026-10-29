'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('family/index.html','utf8');
const css=fs.readFileSync('family/family.css','utf8');
const js=fs.readFileSync('family/family.js','utf8');
assert.ok(html.includes('id="publishedBadgeV183"'));
assert.ok(html.includes('id="publishedTimeV183"'));
assert.ok(html.includes('id="publishedStaleV183"'));
assert.ok(html.indexOf('id="publishedTimeV183"')<html.indexOf('id="spent"'));
assert.ok(html.includes('family.css?v=183')&&html.includes('family.js?v=183'));
assert.ok(css.includes('.published-chip-v183')&&css.includes('.hero-top-v183'));
const statuses=[];
class Node{
 constructor(){this.style={};this.hidden=false;this._text='';this.events={};this.children=[];this.className='';this.attrs={};
 this.classList={toggle:(cls,on)=>{statuses.push([cls,on]);this.className=on?cls:''}};}
 set textContent(s){this._text=String(s);this.children=[]}
 get textContent(){return this._text+this.children.map(x=>x.textContent).join('')}
 setAttribute(k,v){this.attrs[k]=String(v)}
 addEventListener(k,fn){this.events[k]=fn}
 append(...args){this.children.push(...args)}
 replaceChildren(...args){this._text='';this.children=[...args]}
}
const ids=Object.fromEntries([
 'status','period','spent','budgetSection','budgetEmpty','budget','remaining','remainLabel',
 'progressFill','budgetMeter','budgetRatio','calendarMeter','calendarFill','elapsedRatio',
 'paceEvaluation','paceTitle','paceDetail','dailyGuide','dailyPace','categories','caution',
 'cautionText','updated','refresh','legacyHint','publishedBadgeV183','publishedTimeV183',
 'publishedStaleV183'
].map(k=>[k,new Node()]));
const document={getElementById:id=>ids[id],createElement:()=>new Node(),addEventListener:()=>{},hidden:false};
let time='2026-10-29T12:40:00Z';
let published='2026-10-29T12:14:00Z';
class Clock extends Date{
 constructor(...args){super(...(args.length?args:[time]))}
 static now(){return Date.parse(time)}
}
const fetch=async()=>({ok:true,json:async()=>({published_at:published,
 snapshot:{schema_version:2,period_start:'2026-10-16',period_end:'2026-11-17',variable:121177,categories:[]},
 budget:270000})});
vm.runInNewContext(js,{document,location:{hash:'#'+'a'.repeat(64)},fetch,
 setInterval:()=>{},Intl,Date:Clock,Number,String,Array,JSON,Error,Promise});
async function refresh(){ids.refresh.events.click();for(let i=0;i<12;i++)await Promise.resolve()}
(async()=>{
 await refresh();
 assert.ok(ids.publishedTimeV183.textContent.includes('10/29'),'Published date must be JST');
 assert.ok(ids.publishedTimeV183.textContent.includes('21:14'),'Time from published_at, not browser clock');
 assert.ok(!ids.publishedTimeV183.textContent.includes('21:40'),'Do not substitute fetch time');
 assert.equal(ids.publishedStaleV183.hidden,true);
 assert.equal(ids.spent.textContent,'￥121,177');
 published='2026-10-27T12:14:00Z';
 await refresh();
 assert.equal(ids.publishedStaleV183.hidden,false,'Old snapshot must be visibly marked stale');
 assert.ok(ids.status.textContent.includes('24時間以上前'));
 assert.ok(statuses.some(([cls,on])=>cls==='is-stale'&&on===true));
 console.log('FAMILY_PUBLISHED_STAMP_V183_PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
