'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const app=fs.readFileSync('app.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const css=fs.readFileSync('ui-modern-v169.css','utf8');
// Header: one quick action, and original import tab remains fully operational.
assert.match(app,/function ensureHeaderImportShortcut\(\)/);
assert.match(app,/b\.id='treasuryHeaderImportV214'/);
assert.match(app,/importTab\.click\(\)/);
assert.match(app,/if\(\$\('treasuryHeaderImportV214'\)\)return/);
assert.match(html,/data-page="imports"/);
assert.match(css,/#treasuryHeaderActionsV180>\.tab,/);
// Only visible panels paint. Forecast reuse must preserve the 90-day baseline.
assert.match(app,/window\.addEventListener\('treasury:pagechange',render\)/);
assert.match(app,/if\(active==='cashflow'\)/);
assert.match(app,/const f90=forecast\(90\)/);
assert.match(app,/const forecastAt=limit=>/);
assert.equal((app.match(/eventsBody'\)\.innerHTML/g)||[]).length,1);
assert.ok(!app.includes('f90=forecast(90),f=horizon===90?f90:forecast(horizon)'));
// Published HTML and PWA match; PDF binary assets are kept but loaded lazily.
assert.match(sw,/const PRECACHE=CORE\.filter\(path=>!path\.startsWith\("\.\/vendor\/pdfjs\/"\)\)/);
assert.match(sw,/const CACHE="household-treasury-v215-/);
assert.ok(html.includes('./app.js?v=214')&&sw.includes('"./app.js?v=214"'));
const handlers={};
let requests=0;
const cache={
  async match(){return new Response('cached-versioned-script');},
  async put(){},
  async addAll(){},
};
const scope={
  self:{addEventListener:(type,fn)=>{handlers[type]=fn},skipWaiting:async()=>{},clients:{claim:async()=>{}}},
  caches:{open:async()=>cache,keys:async()=>[],delete:async()=>true},
  fetch:async()=>{requests++;return new Response('network')},
  location:{origin:'https://example.com'},
  URL,Response,
};
vm.runInNewContext(sw,scope);
assert.equal(typeof handlers.fetch,'function');
async function testServiceWorker(){
  let promise;
  handlers.fetch({
    request:{method:'GET',url:'https://example.com/app.js?v=214',mode:'cors'},
    respondWith:p=>{promise=p},waitUntil:()=>{},
  });
  assert.equal(await (await promise).text(),'cached-versioned-script');
  assert.equal(requests,0,'repeat JS/CSS load must avoid network');
  handlers.fetch({
    request:{method:'GET',url:'https://example.com/household-treasury/',mode:'navigate'},
    respondWith:p=>{promise=p},waitUntil:()=>{},
  });
  assert.equal(await (await promise).text(),'network');
  assert.equal(requests,1,'HTML navigation must check the network for releases');
  console.log('FAST_HEADER_IMPORT_V214_PASS');
}
testServiceWorker().catch(e=>{console.error(e);process.exitCode=1});
