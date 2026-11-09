'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('sync-v24.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');
assert.ok(html.includes('sync-v26.js?v=217'));
assert.ok(sw.includes('./sync-v24.js?v=217'));
assert.match(source,/select=revision,version,updated_at/);
assert.match(source,/if\(header&&meta\.syncedFingerprint&&metaRev>0&&Number\(header\.revision\)===metaRev\)/);
assert.match(source,/const row=header\?await fetchRemote\(\):null/);
function cut(begin,end){
 const a=source.indexOf(begin),b=source.indexOf(end,a+begin.length);
 assert.ok(a>=0&&b>a,'function missing: '+begin);return source.slice(a,b);
}
const metaSrc=cut('async function fetchRemoteRevision(', 'async function fetchRemote(){');
const initSrc=cut('async function initializeSync(', 'function isTransientSyncFailure(');
async function testSmallHeader(){
 let calls=0;let seenURL='';
 const ctx={
  SUPABASE_URL:'https://example.invalid',user:{id:'owner'},
  encodeURIComponent,Date,Number,Array,Promise,navigator:{onLine:true},
  setTimeout:fn=>{fn();return 1},restHeaders:()=>({}),
  fetchJson:async url=>{seenURL=url;if(++calls===1)throw Error('クラウド更新確認失敗 (503)');return [{revision:642,version:1}]},
  isTransientSyncFailure:e=>String(e).includes('503')
 };
 vm.runInNewContext(metaSrc+';this.check=fetchRemoteRevision;',ctx);
 const header=await ctx.check();
 assert.equal(header.revision,642);
 assert.equal(calls,2);
 assert.ok(seenURL.includes('select=revision,version,updated_at'));
 assert.ok(!seenURL.includes('select=*'),'Metadata request must never download ciphertext');
}
async function checkInitialize({revision=642,syncedFingerprint='local',localFingerprint='local',serverFingerprint='remote',headerPresent=true}={}){
 const actions=[];
 const ctx={
  user:{id:'owner'},accessToken:'fake',syncReady:false,syncBlocked:false,
  initInFlight:false,initQueuedReason:'',initSeq:0,lastInitStartedAt:0,
  lastInitStage:'boot',lastInitError:'',remoteRevision:0,lastSuccessfulCheckAt:0,
  Date,Number,String,Math,Promise,Error,Event:class{constructor(name){this.name=name}},
  window:{dispatchEvent:()=>actions.push('event')},
  renderSafetyUi:()=>{},status:(tag)=>actions.push('status:'+tag),getPass:()=> 'safe-passphrase',
  fetchRemoteRevision:async()=>{actions.push('smallGET');return headerPresent?{revision,version:1}:null},
  fetchRemote:async()=>{actions.push('FULL_DOWNLOAD');return{revision,version:1,updated_at:'2026-11-09T12:38:00Z'}},
  stateNow:()=>({label:'local'}),fingerprint:s=>s.label==='local'?localFingerprint:serverFingerprint,
  stateScore:()=>100,getMeta:()=>({revision:642,syncedFingerprint}),
  decryptState:async()=>({label:'remote'}),
  backupLocal:()=>actions.push('backup'),
  clearConflictBackups:()=>actions.push('clearConflict'),
  setMeta:()=>actions.push('setMeta'),
  subscribeRealtime:async()=>actions.push('subscribe'),
  pushCurrent:async force=>actions.push('CAS_PUSH:'+force),
  applyRemote:async()=>actions.push('applyRemote'),
  blockConflict:()=>actions.push('conflict'),
  clearRecovery:()=>actions.push('clearRecovery'),
  queueInitialize:()=>actions.push('queue')
 };
 vm.runInNewContext(initSrc+';this.initializeSync=initializeSync;',ctx);
 await ctx.initializeSync('test');
 return {actions,ctx};
}
(async()=>{
 await testSmallHeader();
 const matched=await checkInitialize();
 assert.ok(matched.actions.includes('smallGET'));
 assert.ok(!matched.actions.includes('FULL_DOWNLOAD'),'unchanged revision must not download 700KB encrypted payload');
 assert.ok(!matched.actions.some(x=>x.startsWith('CAS_PUSH')),'no unnecessary write when unchanged');
 assert.equal(matched.ctx.syncReady,true);
 assert.ok(matched.actions.includes('subscribe'));
 const edited=await checkInitialize({localFingerprint:'unsynced-local'});
 assert.ok(edited.actions.includes('CAS_PUSH:true'),'local edits use a compare-and-swap write');
 assert.ok(!edited.actions.includes('FULL_DOWNLOAD'),'same server revision needs no full download');
 const changed=await checkInitialize({revision:643});
 assert.ok(changed.actions.includes('FULL_DOWNLOAD'),'new remote revision MUST be decrypted and reconciled');
 assert.ok(changed.actions.includes('applyRemote'));
 assert.ok(!changed.actions.some(x=>x.startsWith('CAS_PUSH')),'remote changes must not be overwritten');
 const collision=await checkInitialize({revision:643,localFingerprint:'unsynced-local'});
 assert.ok(collision.actions.includes('FULL_DOWNLOAD'));
 assert.ok(collision.actions.includes('conflict'),'two dirty devices must block automatic overwrite');
 assert.ok(!collision.actions.some(x=>x.startsWith('CAS_PUSH')));
 const first=await checkInitialize({headerPresent:false});
 assert.ok(!first.actions.includes('FULL_DOWNLOAD'));
 assert.ok(first.actions.includes('CAS_PUSH:true'),'brand-new user still saves first state');
 console.log('REVISION_FIRST_SYNC_V217_PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
