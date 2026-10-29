'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync('app.js','utf8');
const start=app.indexOf('function mergeRecordScore(');
const end=app.indexOf('\nfunction prepareImportedBackup(');
assert.ok(start>=0&&end>start);
const code=app.slice(start,end);
const ctx={structuredClone:x=>JSON.parse(JSON.stringify(x)),JSON,
 normalizeText:x=>String(x??'').normalize('NFKC').replace(/[\s　]+/g,'').toUpperCase(),
 Number,String,Array,Map,Object};
const f=vm.runInNewContext(code+'\n({evidenceKey,mergeEvidenceArray})',ctx);
const local=[{
 id:'cash-expense:receipt-abc',date:'2026-10-29',description:'パン屋（修正済）',
 amount:1200,category:'FOOD',subcategory:'GROCERIES',spending_class:'NORMAL',
 semantic_manual_override:true,semantic_transaction_edit_version:108,
 reviewed_at:'2026-10-29T14:00:00Z'
}];
const backup=[{
 id:'cash-expense:receipt-abc',date:'2026-10-29',description:'パン屋',
 amount:1000,category:'FOOD',spending_class:'NORMAL',source_file:'old.csv',
 original_details:'more fields are not more authoritative',imported_at:'2026-10-28T10:00:00Z'
}];
assert.equal(f.evidenceKey('cashExpenses',local[0]),f.evidenceKey('cashExpenses',backup[0]),
 'Cash key must stay fixed if editable fields change');
const merged=f.mergeEvidenceArray('cashExpenses',local,backup);
assert.equal(merged.length,1,'Restoring an older backup must not duplicate a corrected cash expense');
assert.equal(merged[0].amount,1200,'Preserve the reviewed local amount');
assert.equal(merged[0].description,'パン屋（修正済）','Preserve the reviewed local merchant name');
assert.equal(local[0].amount,1200,'Do not mutate original local data');
const separate=f.mergeEvidenceArray('cashExpenses',local,[{...backup[0],id:'cash-expense:other'}]);
assert.equal(separate.length,2,'Distinct receipt IDs must remain separate');
const legacy=f.mergeEvidenceArray('cashExpenses',
 [{date:'2026-10-28',description:'ラーメン',amount:3300,category:'FOOD',spending_class:'NORMAL'}],
 [{date:'2026-10-28',description:'ラーメン',amount:3300,category:'FOOD',spending_class:'NORMAL',source:'CSV'}]);
assert.equal(legacy.length,1,'Legacy ID-less cash rows still deduplicate by content');
console.log('CASH_MERGE_STABLE_V184_PASS');
