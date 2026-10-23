'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
class Node {
 constructor(tag='div'){this.tag=tag;this.children=[];this.events={};this.attributes={};this.className='';this.hidden=false;this.value='';this.style={};this.classList={toggle:()=>{}};this._text='';}
 set textContent(s){this._text=String(s);this.children=[]}
 get textContent(){return this._text+this.children.map(x=>x.textContent||'').join('')}
 append(...nodes){this.children.push(...nodes)}
 replaceChildren(...nodes){this.children=[...nodes];this._text=''}
 setAttribute(k,v){this.attributes[k]=String(v)}
 addEventListener(k,cb){this.events[k]=cb}
 click(){this.events.click?.()}
}
const ids=Object.fromEntries(['status','period','spent','budgetSection','budgetEmpty','budget','remaining','remainLabel','progressFill','budgetMeter','budgetRatio','categories','caution','cautionText','updated','refresh'].map(id=>[id,new Node()]));
const document={getElementById:id=>ids[id],createElement:tag=>new Node(tag),addEventListener:()=>{},hidden:false};
const snapshot={
 period_start:'2026-10-16',period_end:'2026-11-17',variable:22000,undetermined:0,review_count:0,
 categories:[
  {key:'DAILY_GOODS',label:'日用品',amount:17000,subcategories:[
   {key:'CLOTHING',label:'衣類',amount:11460,days:[{date:'2026-10-20',amount:11460,count:1}]},
   {key:'HOUSEHOLD',label:'生活用品',amount:5540,days:[{date:'2026-10-21',amount:5540,count:2}]}
  ]},
  {key:'FOOD',label:'食費',amount:5000,subcategories:[{key:'GROCERIES',label:'食料品',amount:5000,days:[{date:'2026-10-19',amount:5000,count:3}]}]}
 ]
};
const fetch=async()=>({ok:true,json:async()=>({snapshot,budget:100000,published_at:new Date().toISOString()})});
vm.runInNewContext(fs.readFileSync('family/family.js','utf8'),{
 document,location:{hash:'#'+'a'.repeat(64)},fetch,setInterval:()=>{},Intl,Date,Number,String,Array,JSON,Error,Promise
});
const lookup=(root,cls)=>{if(root.className.split(' ').includes(cls))return root;for(const c of root.children){const found=lookup(c,cls);if(found)return found}return null};
async function check(){
 await new Promise(resolve=>setImmediate(resolve));
 assert.ok(ids.spent.textContent.includes('22,000'));
 assert.equal(ids.categories.children.length,2);
 assert.equal(!!lookup(ids.categories,'day-row'),false,'Individual dates are hidden before expansion');
 let major=ids.categories.children[0].children[0];
 assert.equal(major.attributes['aria-expanded'],'false');
 major.click();
 let body=lookup(ids.categories,'major-body');
 assert.ok(body,'Middle category opened beneath its own row');
 let minor=lookup(ids.categories,'minor-row');
 assert.ok(minor,'Subcategory appears only after opening major category');
 assert.equal(minor.attributes['aria-expanded'],'false');
 minor.click();
 let day=lookup(ids.categories,'day-row');
 assert.ok(day,'Day totals appear under minor category');
 assert.ok(day.textContent.includes('2026/10/20'));
 assert.ok(day.textContent.includes('11,460'));
 assert.ok(!ids.categories.textContent.includes('PRIVATE SHOP'));
 assert.equal(!!lookup(ids.categories,'hub-edit'),false,'Readonly page has no edit buttons');
 console.log('FAMILY_VIEWER_V163_INTERACTION_PASS');
}
check().catch(err=>{console.error(err);process.exitCode=1});
