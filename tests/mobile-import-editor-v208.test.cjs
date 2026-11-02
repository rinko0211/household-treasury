'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs'),vm=require('node:vm');
const css=fs.readFileSync('ui-modern-v169.css','utf8');
const semantic=fs.readFileSync('semantic-ui-v48.js','utf8');
const hub=fs.readFileSync('expense-unified-v148.js','utf8');
const app=fs.readFileSync('app.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const loader=fs.readFileSync('sync-state-sanitizer-v22.js','utf8');

test('real mobile editor markup is responsive without forced 3- or 4-column inline grids',()=>{
 assert.match(semantic,/class="form v208-cash-fields"/);
 assert.match(semantic,/class="form v208-editor-form"/);
 assert.match(semantic,/class="form v208-card-fields"/);
 assert.doesNotMatch(semantic,/grid-template-columns:1fr 2fr 1fr/);
 assert.doesNotMatch(semantic,/grid-template-columns:repeat\(4,1fr\);gap:8px;margin-top:12px/);
 assert.match(css,/#transactionEditorV108 .v208-cash-fields/);
 assert.match(css,/#transactionCardEditorV114 .v208-card-fields/);
 assert.match(css,/@media\(max-width:460px\)/);
 assert.match(css,/#transactionEditorV108 input,#transactionEditorV108 select/);
 assert.match(css,/font-size:16px; \/\* prevent iOS auto-zoom/);
});
test('Import filenames and status labels break without stretching the 12-column grid',()=>{
 assert.match(css,/#imports #importResults .title/);
 assert.match(css,/overflow-wrap:anywhere/);
 assert.match(css,/#imports #importResults .row>span/);
 assert.match(css,/#imports #importResults \.title\{/);
});
test('long encoded Japanese names display readably while imports are batched and escaped',async()=>{
 const start=app.indexOf('// Display-only decoding:');
 const end=app.indexOf('function importRuleSpec(',start);
 assert.ok(start>0&&end>start);
 const source=app.slice(start,end);
 const panels=[],collection={prepend:x=>panels.unshift(x)},renders=[];
 const context={
  document:{createElement:()=>({style:{},innerHTML:'',className:''})},
  $:id=>{assert.equal(id,'importResults');return collection},
  esc:x=>String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
  yen:n=>'¥'+Number(n).toLocaleString('ja-JP'),
  importOne:async file=>{
    if(file.name==='error.csv')throw Error('bad csv');
    if(file.name==='repeat.csv')return {source:'既存',added:0,duplicates:1,skipped:true};
    return {source:'支払方法付き購入CSV',added:2,duplicates:0,review:0};
  },
  render:()=>renders.push(1),
 };
 vm.runInNewContext(source+'\nthis.testApi={importDisplayName,readCsv};',context);
 const name='JAL_%E3%82%BF%E3%82%A4%E3%83%A4%E7%B5%84%E3%81%BF%E6%8F%9B%E3%81%88.csv';
 await context.testApi.readCsv([{name},{name:'repeat.csv'},{name:'error.csv'}]);
 assert.equal(renders.length,1,'Dashboard should refresh once for three imported files');
 assert.equal(panels.length,3);
 assert.ok(panels[2].innerHTML.includes('タイヤ組み換え'));
 assert.ok(!panels[2].innerHTML.includes('%E3%82'));
 assert.match(panels[0].innerHTML,/取込停止/);
 assert.equal(context.testApi.importDisplayName({name:'JAL_%ZZ.csv'}),'JAL_%ZZ.csv');
});
test('detail disclosure reuses the same snapshot instead of refetching state per row',()=>{
 assert.match(hub,/function detailPanel\(bucket,st\)/);
 assert.match(hub,/detailsFor\?\.\(st,x.identity\)/);
 assert.match(hub,/eligibility\?\.\(st,wifeMatch\[1\]/);
 assert.match(hub,/if\(expanded\)html\+=detailPanel\(b,st\)/);
 assert.match(hub,/wrapper.innerHTML=detailPanel\(currentDetailBucket,currentDetailState\|\|stateNow\(\)\)/);
});
test('all mobile UI cache-busted links agree with deployed PWA versions',()=>{
 for(const file of ['app.js','expense-unified-v148.js','ui-modern-v169.css'])
   assert.ok(html.includes(file+'?v=208'),'index lacks updated '+file);
 assert.ok(loader.includes('semantic-ui-v48.js?v=208'));
 for(const file of ['app.js','expense-unified-v148.js','ui-modern-v169.css','semantic-ui-v48.js'])
   assert.ok(sw.includes('./'+file+'?v=208'),'service worker lacks '+file);
});
