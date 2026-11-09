'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const source=fs.readFileSync('sync-v24.js','utf8');
const shell=fs.readFileSync('sw.js','utf8');
const html=fs.readFileSync('index.html','utf8');
assert.match(source,/const REST_GET_TIMEOUT_MS=180000/);
assert.match(source,/const REST_WRITE_TIMEOUT_MS=240000/);
assert.match(source,/new CompressionStream\('gzip'\)/);
assert.match(source,/new DecompressionStream\('gzip'\)/);
assert.match(source,/clearRecovery\(\);status\('Realtime同期済み'/);
assert.match(source,/scheduleRecovery\('送信結果の安全な再照合',e\)/);
assert.match(source,/scheduleRecovery\('取得失敗後の再照合',e\)/);
assert.match(html,/sync-v26\.js\?v=216/);
assert.match(shell,/sync-v24\.js\?v=216/);
assert.match(shell,/sync-v26\.js\?v=216/);
function segment(start,end){
 const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,'source function missing: '+start);
 return source.slice(a,b);
}
async function run(){
 // The new envelope must decrypt both existing (v1) and gzip-compressed (v2) states.
 const cryptoFns=segment('async function deriveKey(', 'function getPass(){');
 const ctx={crypto:webcrypto,TextEncoder,TextDecoder,Response,Blob,CompressionStream,DecompressionStream,Uint8Array,
  Buffer,Error,JSON,Number,Math,Promise,Array,Uint32Array};
 vm.runInNewContext(`
  const enc=new TextEncoder(),dec=new TextDecoder();
  const b64=b=>Buffer.from(b).toString('base64');
  const unb64=s=>new Uint8Array(Buffer.from(s,'base64'));
  ${cryptoFns}
  this.fns={encryptState,decryptState,packSyncState,unpackSyncState};
 `,ctx);
 const original={settings:{salary:541194},imports:[...Array(1200)].map((_,i)=>({
  source:'purchase',date:'2026-11-09',amount:i+1,merchant:'北海道食料品店',category:'FOOD',description:'生活費の取引'
 }))};
 const plaintext=Buffer.byteLength(JSON.stringify(original));
 const zipped=await ctx.fns.encryptState(original,'example-password-long');
 assert.equal(zipped.version,2,'large repetitive JSON must gzip');
 assert.ok(zipped.ciphertext.length<plaintext/2,'compressed ciphertext is meaningfully smaller');
 assert.equal(JSON.stringify(await ctx.fns.decryptState(zipped,'example-password-long')),JSON.stringify(original));
 const legacy={settings:{salary:541194},purchaseEvents:[]};
 const old=await ctx.fns.encryptState(legacy,'example-password-long');
 assert.equal(old.version,1);
 assert.equal(JSON.stringify(await ctx.fns.decryptState(old,'example-password-long')),JSON.stringify(legacy));
 const saveCompression=ctx.CompressionStream;ctx.CompressionStream=undefined;
 const fallback=await ctx.fns.encryptState(original,'example-password-long');
 assert.equal(fallback.version,1,'unsupported browsers must use compatible v1');
 assert.equal(JSON.stringify(await ctx.fns.decryptState(fallback,'example-password-long')),JSON.stringify(original));
 ctx.CompressionStream=saveCompression;
 const tampered={...zipped,ciphertext:zipped.ciphertext.slice(0,-4)+'AAAA'};
 await assert.rejects(ctx.fns.decryptState(tampered,'example-password-long'),'encrypted state cannot be silently corrupted');
 // Bounded request timeouts allow slow uploads to finish.
 const fetchSource=segment('async function fetchJson(', 'async function fetchRemote(');
 const seen=[];
 const fetchCtx={AbortController,Math,Number,String,JSON,Promise,Error,REST_GET_TIMEOUT_MS:180000,REST_WRITE_TIMEOUT_MS:240000,
  setTimeout:(_fn,ms)=>{seen.push(ms);return 1},clearTimeout:()=>{},
  fetch:async()=>({ok:true,status:200,text:async()=>'{"revision":1}'})};
 vm.runInNewContext(fetchSource+';this.fetchJson=fetchJson;',fetchCtx);
 await fetchCtx.fetchJson('https://example.invalid');
 await fetchCtx.fetchJson('https://example.invalid',{method:'PATCH'});
 assert.deepEqual(seen,[180000,240000]);
 // The recovery controller must retry only transient errors, never authentication errors.
 const recover=segment('function isTransientSyncFailure(', 'function queueInitialize(');
 const recoveryCtx={Error,Date,String,Math,Number,clearTimeout:()=>{},setTimeout:(_fn,ms)=>{seen.push(ms);return 3},
  user:{id:'test'},syncBlocked:false,recoveryFailures:0,recoveryTimer:null,
  navigator:{onLine:true},status:()=>{},queueInitialize:()=>{},Promise};
 vm.runInNewContext(recover+';this.isTransientSyncFailure=isTransientSyncFailure;this.scheduleRecovery=scheduleRecovery;',recoveryCtx);
 assert.equal(recoveryCtx.isTransientSyncFailure(Error('クラウド保存失敗 (503)')),true);
 assert.equal(recoveryCtx.isTransientSyncFailure(Error('クラウド保存失敗 (401)')),false);
 recoveryCtx.scheduleRecovery('check',Error('クラウド保存失敗 (503)'));
 assert.equal(seen.at(-1),4000);
 const before=seen.length;
 recoveryCtx.scheduleRecovery('check',Error('クラウド保存失敗 (401)'));
 assert.equal(seen.length,before,'Never retry authorization failures');
 // Service worker should not download 100+ assets during install on weak cellular links.
 const listeners={};let precache=[];
 const cache={addAll:async paths=>{precache=paths}};
 const swCtx={self:{addEventListener:(name,fn)=>listeners[name]=fn,skipWaiting:async()=>{},clients:{claim:async()=>{}}},
  caches:{open:async()=>cache,keys:async()=>[],delete:async()=>true},URL,Response,location:{origin:'https://example.invalid'}};
 vm.runInNewContext(shell,swCtx);
 let install;
 listeners.install({waitUntil:p=>{install=p}});
 await install;
 assert.ok(precache.length<=10,'Slow connection PWA install should load a small shell, not all modules');
 assert.ok(precache.some(s=>s.includes('sync-v24.js?v=216')));
 assert.ok(!precache.some(s=>s.includes('pdfjs')));
 console.log('LOW_BANDWIDTH_SYNC_V216_PASS',JSON.stringify({raw:plaintext,encrypted:zipped.ciphertext.length,precache:precache.length}));
}
run().catch(e=>{console.error(e);process.exitCode=1});
