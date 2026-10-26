'use strict';
// Verify that the live loader, HTML and offline cache all pin the same asset.
const fs=require('node:fs'),assert=require('node:assert/strict');
const loader=fs.readFileSync('sync-state-sanitizer-v22.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const names=process.argv.slice(2).filter(s=>!s.startsWith('--'));
assert.match(sw,/\bconst CACHE\s*=\s*['"]household-treasury-v\d+[-\w]*['"]/,
  'Service Worker must declare a numeric revisioned cache key');
assert.match(loader,/window\.__householdRuntimeRelease\s*=\s*['"]v\d+['"]/,
  'Runtime must identify its current version');
function quoteRe(s){return s.replace(/[|\\{}()[\]^$+*?.]/g,'\\$&')}
function exactlyOne(source,name,regex,label){
 const matches=[...source.matchAll(regex)];
 assert.equal(matches.length,1,label+': expected one revisioned reference to '+name+', got '+matches.length);
 return Number(matches[0][1]);
}
function verify(name){
 if(!/^[a-zA-Z0-9_.-]+\.js$/.test(name))throw Error('Invalid JS asset name: '+name);
 const patt='\\./'+quoteRe(name)+'\\?v=(\\d+)';
 const scriptRef='injectClassic\\([\\x27\\x22]'+patt+'[\\x27\\x22]';
 const swRef='[\\x27\\x22]'+patt+'[\\x27\\x22]';
 if(new RegExp(scriptRef).test(loader)){
  const l=exactlyOne(loader,name,new RegExp(scriptRef,'g'),'Loader');
  const w=exactlyOne(sw,name,new RegExp(swRef,'g'),'Service Worker');
  assert.equal(l,w,'Revision mismatch '+name+': loader v'+l+' vs offline cache v'+w);
  return {name,revision:l,owner:'classic-loader'};
 }
 const h=exactlyOne(html,name,new RegExp('(?:src|href)=[\\x27\\x22]'+patt+'[\\x27\\x22]','g'),'HTML');
 const w=exactlyOne(sw,name,new RegExp(swRef,'g'),'Service Worker');
 assert.equal(h,w,'Revision mismatch '+name+': HTML v'+h+' vs offline cache v'+w);
 return {name,revision:h,owner:'HTML'};
}
if(!names.length)throw Error('Pass at least one current JS asset filename');
const result=names.map(verify);
console.log('CI_CURRENT_ASSETS_V180_PASS',JSON.stringify({cache:true,assets:result}));
