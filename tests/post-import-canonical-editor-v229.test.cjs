'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('import-postedit-v229.js','utf8');
const editor=fs.readFileSync('semantic-ui-v48.js','utf8');
const simple=fs.readFileSync('simple-expense-import-v213.js','utf8');
const loader=fs.readFileSync('sync-state-sanitizer-v22.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const html=fs.readFileSync('index.html','utf8');
// A single canonical editor is used on 支出 and inline on Import:
for(const field of ['transactionEditorEconV108','transactionEditorSpendV108','transactionEditorNatureV159',
 'transactionEditorPersonalOwnerV193','transactionEditorCatV108','transactionEditorSubV108',
 'transactionCardMasterV176','transactionCashCardMasterV178']){
 assert.ok(editor.includes(field),field+' missing');
}
assert.match(editor,/function openTransactionEditor\(kind,id,options=null\)/);
assert.match(editor,/inlineHost\.appendChild\(m\)/);
assert.match(editor,/source:'imports'/);
assert.match(editor,/nextAfterSave\(editContext,nextRecord\)/);
assert.match(editor,/importEditSaved\(editContext,kind,id\)/);
assert.match(simple,/records:fresh\.out\.map\(/,'Direct CSV picker emits exact source identifiers');
assert.match(loader,/import-postedit-v229\.js\?v=229/);
assert.match(sw,/\.\/import-postedit-v229\.js\?v=229/);
assert.match(html,/sync-state-sanitizer-v22\.js\?v=229/);
const calls=[],events={},disk=new Map(),elements={};
const grid={firstChild:null,insertBefore(el){el.isConnected=true;elements[el.id]=el}};
const node=id=>elements[id]||(elements[id]={id,style:{},dataset:{},isConnected:true,
 innerHTML:'',textContent:'',hidden:false,
 appendChild(x){x.isConnected=true;return x},addEventListener(){},scrollIntoView(){},
 closest(){return null}});
const imported=node('imports');imported.classList={contains:x=>x==='active'};
node('postImportReviewListV229');node('postImportReviewStatusV229');node('postImportInlineEditorV229');node('importResults');
const document={
 readyState:'complete',
 querySelector:x=>x==='#imports .grid'?grid:null,
 getElementById:x=>elements[x]||null,
 createElement:tag=>({tagName:tag,style:{},dataset:{},id:'',isConnected:true,
    hidden:false,innerHTML:'',appendChild(){},addEventListener(){},scrollIntoView(){}})
};
const state={cashExpenses:[],cashTransactions:[],purchaseEvents:[]};
const window={
 getTreasuryStateRaw:()=>state,
 localStorage:{getItem:k=>disk.get(k)||null,setItem:(k,v)=>disk.set(k,v)},
 openSemanticTransactionEditorV108:(kind,id,options)=>calls.push({kind,id,host:options?.inlineHost?.id}),
 addEventListener:(name,fn)=>events[name]=fn
};
const ctx={window,document,Intl,Number,String,Math,Array,Map,Set,Object,JSON,Error,Promise,
 console,importOne:async file=>{
   const id=file.name;
   if(file.type==='bank')state.cashTransactions.push({id,date:'2026-11-23',description_raw:'銀行入金',amount:500});
   else if(file.type==='card')state.purchaseEvents.push({purchase_id:id,purchase_date:'2026-11-23',merchant_raw:'店舗 '+id,original_amount:1250});
   else if(file.type==='cash')state.cashExpenses.push({id,date:'2026-11-23',description:'現金 '+id,amount:123});
   return {added:1,skipped:false};
 }};
vm.createContext(ctx);vm.runInContext(source,ctx,{filename:'import-postedit-v229.js'});
async function main(){
 const api=window.householdImportPostEditV229;
 assert.equal(typeof api.snapshot,'function');
 assert.equal(typeof api.difference,'function');
 assert.ok(ctx.importOne.__postImportReviewV229,'all provider imports use the result hook');
 // Same file imported through generic Import is displayed AND editor auto-opens below.
 await ctx.importOne({name:'credit-1',type:'card'});
 assert.equal(calls.length,1);assert.deepEqual(calls[0],{kind:'purchase',id:'credit-1',host:'postImportInlineEditorV229'});
 assert.match(elements.postImportReviewListV229.innerHTML,/credit-1/);
 assert.match(elements.postImportReviewStatusV229.textContent,/未確認 1件/);
 await ctx.importOne({name:'cash-1',type:'cash'});
 assert.equal(calls[1].kind,'cash_expense');
 await ctx.importOne({name:'bank-1',type:'bank'});
 assert.equal(calls[2].kind,'cash');
 const next=api.nextFor('purchase','credit-1');
 assert.equal(next.kind,'cash_expense');
 // Existing source data changing on reimport is also offered for correction.
 const before=api.snapshot();
 state.purchaseEvents[0].merchant_raw='店舗 更新';
 const changed=api.difference(before,api.snapshot());
 assert.deepEqual(JSON.parse(JSON.stringify(changed)),[{kind:'purchase',id:'credit-1'}]);
 // Duplicate / no-op results do not add a second row.
 const earlier=calls.length;
 api.receive([{kind:'purchase',id:'credit-1'}]);
 assert.equal(calls.length,earlier);
 // The same canonical editor notifies saved state.
 events['treasury:import-review-saved']({detail:{kind:'purchase',id:'credit-1'}});
 assert.match(elements.postImportReviewStatusV229.textContent,/編集済み 1件/);
 assert.equal(api.nextFor('purchase','credit-1').kind,'cash_expense');
 assert.ok(disk.has('householdPostImportReviewV229'),'review session survives reload');
 // A direct uploader sends one ref even without going through importOne.
 state.cashExpenses.push({id:'direct-1',date:'2026-11-23',description:'直接CSV',amount:600});
 events['treasury:expenses-imported']({detail:{records:[{kind:'cash_expense',id:'direct-1'}]}});
 assert.equal(calls.at(-1).id,'direct-1');
 assert.match(elements.postImportReviewListV229.innerHTML,/直接CSV/);
 console.log('POST_IMPORT_CANONICAL_EDITOR_V229_PASS');
}
main().catch(err=>{console.error(err);process.exitCode=1});