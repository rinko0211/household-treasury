'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const v50=fs.readFileSync('observer-guard-v50.js','utf8');
const v71=fs.readFileSync('semantic-observer-guard-v71.js','utf8');
const calls=[];
class NativeMutationObserver {
 constructor(callback){this.callback=callback;this.disconnected=false}
 observe(node,options){calls.push({node:node.id,options})}
 disconnect(){this.disconnected=true}
 takeRecords(){return []}
}
const main={id:'main',matches:q=>q==='main.app'};
const importResults={id:'importResults',matches:()=>false};
const window={MutationObserver:NativeMutationObserver};
const timers=[];
const context=vm.createContext({
 window,document:{getElementById:id=>id==='importResults'?importResults:null},
 setTimeout:(fn)=>timers.push(fn),Reflect,Proxy,Error,String,Object
});
vm.runInContext(v50,context,{filename:'observer-guard-v50.js'});
vm.runInContext(v71,context,{filename:'semantic-observer-guard-v71.js'});
// The callback text activates v50's observer proxy; the constructor call's
// source filename activates v71. This was the exact infinite recursion chain.
vm.runInContext('function renderAll(){};function queue(){setTimeout(renderAll,70)};window.__semanticObserverV185 = new window.MutationObserver(queue);',context,{filename:'semantic-ui-v48.js'});
const observer=window.__semanticObserverV185;
assert.ok(observer);
assert.doesNotThrow(()=>observer.observe(main,{childList:true,subtree:true}));
assert.equal(calls.length,0,'Semantic main observer must remain suppressed');
assert.equal(observer.__v71SuppressedMainObserver,true);
assert.doesNotThrow(()=>observer.observe(importResults,{childList:true,subtree:true,characterData:true}));
assert.equal(calls.length,1,'Non-main observations must reach native observer once');
assert.equal(calls[0].node,'importResults');
assert.doesNotThrow(()=>observer.disconnect());
assert.equal(observer.disconnected,true);
// Non-semantic observers still use the v50 behavior and may observe the
// importResults node instead of the entire app, with no recursive wrappers.
vm.runInContext('function renderAll2(){};function queueOther(){setTimeout(renderAll2,70)};window.__otherObserverV185 = new window.MutationObserver(queueOther);',context,{filename:'dashboard-v39.js'});
window.__otherObserverV185.observe(main,{childList:true,subtree:true});
assert.equal(calls.length,2);
assert.equal(calls[1].node,'importResults');
assert.doesNotThrow(()=>window.__otherObserverV185.disconnect());
for(const fn of timers)fn();
console.log('OBSERVER_PROXY_NO_RECURSION_V185_PASS');
