'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');

function checkReleaseReferences(html,loader,serviceWorker){
  const loaded=new Map();
  for(const [where,text] of [['HTML',html],['dynamic loader',loader]]){
    for(const m of text.matchAll(/\.\/([a-z0-9-]+\.js)\?v=(\d+)/gi)){
      const path=m[1],url='./'+path+'?v='+m[2];
      const previous=loaded.get(path);
      assert.ok(!previous||previous.url===url,
        path+' loaded with conflicting versions by '+previous?.where+' and '+where);
      loaded.set(path,{url,where});
    }
  }
  assert.ok(loaded.size>=40,'Expected the actual app script manifest, not empty inputs');
  const cacheMatch=serviceWorker.match(/const CACHE="(household-treasury-v\d+-[^"]+)"/);
  assert.ok(cacheMatch,'PWA service-worker cache must declare a release-specific version');
  for(const [path,{url,where}] of loaded){
    assert.ok(serviceWorker.includes('"'+url+'"'),
      path+' referenced by '+where+' but not precached with exactly matching version');
    assert.ok(fs.existsSync(path),'Loaded source absent from repository: '+path);
  }
  // The browser entry point and the expense reporting engine must always
  // invalidate their individual URLs when changed; the manifest links all
  // filenames, not historical hard-coded version literals in CI.
  for(const filename of ['app.js','expense-unified-v148.js','personal-ledger-v186.js',
    'sync-state-sanitizer-v22.js','family-share-owner-v160.js','semantic-ui-v48.js']){
    assert.ok(loaded.has(filename),'Core script missing from HTML or loader: '+filename);
  }
  return {cache:cacheMatch[1],scripts:loaded.size,loaded};
}
const html=fs.readFileSync('index.html','utf8');
const loader=fs.readFileSync('sync-state-sanitizer-v22.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const valid=checkReleaseReferences(html,loader,sw);
const expense=valid.loaded.get('expense-unified-v148.js').url;
assert.throws(()=>checkReleaseReferences(html.replace(expense,expense.replace(/\d+$/, '99999')),loader,sw),
  /not precached/, 'A mismatched asset version must fail before deployment');
console.log('RELEASE_ASSET_CONSISTENCY_PASS',valid.cache,valid.scripts+' scripts');
