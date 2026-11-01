'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('receipt-bundle-import-v202.js','utf8');
const quote=s=>'"'+String(s??'').replaceAll('"','""')+'"';
function csv(head,rows){return [head,...rows].map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n'}
const transactionHead=['利用日','利用時刻','店舗','内容','購入金額_円','支払方法','カード等','家計区分','カテゴリ','集計状態','取込可否','重複キー','証憑','備考'];
const itemHead=['取引ID','利用日','店舗','商品名','数量','単価_円','金額_円','カテゴリ','証憑','取引状態'];
const amazonHead=['購入日','画面時刻','店舗','商品','選択サイズ','選択色','表示価格_円','数量仮定','購入確認','支出計上','証憑','備考','仮計上日'];
const key='receipt:2026-10-31:shop-test:1300:receipt123';
const t=()=>csv(transactionHead,[['2026-10-31','14:08','パン屋','まとめ',1300,'現金','','変動費','食費','要確認','',''+key,'receipt.jpg','']]);
const items=()=>csv(itemHead,[
 [key,'2026-10-31','パン屋','パンA',2,300,600,'食費','receipt.jpg','レシート確認'],
 [key,'2026-10-31','パン屋','パンB',1,700,700,'食費','receipt.jpg','レシート確認']
]);
const a=()=>csv(amazonHead,[
 ['', '23:02','Amazon','テスト子どもシャツ','100','白',990,1,'未確認（商品ページ）','暫定計上','image-a.jpg','送料別途','2026-10-31'],
 ['', '23:02','Amazon','テスト日用品','-','赤',799,1,'未確認（商品ページ）','暫定計上','image-b.jpg','送料不明','2026-10-31']
]);
function env(initial={}){
 let st=structuredClone({cashExpenses:[],purchaseEvents:[],cardSettlements:[],imports:[],...initial});
 let writes=0,backs=0,syncs=0,confirmText=[],prior=0;
 const win={
  getTreasuryStateRaw:()=>st,
  replaceTreasuryState:next=>{st=structuredClone(next);writes++;return true},
  treasuryRecoverySnapshot:()=>backs++,
  cloudSyncOnLocalSave:()=>syncs++,
  confirm:text=>{confirmText.push(text);return true},
  householdExpenseUnifiedV148:{render:()=>{}},
  dispatchEvent:()=>{}
 };
 const ctx={window:win,Number,String,Array,Map,Set,Object,Date,Intl,JSON,Math,
   Error,RegExp,structuredClone,CustomEvent:class {},console,
   importOne:async()=>{prior++;return {source:'OTHER'}}};
 vm.createContext(ctx);
 vm.runInContext(source,ctx,{filename:'receipt-bundle-import-v202.js'});
 const api=win.householdReceiptBundleV202;
 return {api,win,get state(){return st},get writes(){return writes},
  get backs(){return backs},get syncs(){return syncs},
  get confirmation(){return confirmText},get passthrough(){return prior},
  async import(text,name='test.csv'){
   return ctx.importOne({name,text:async()=>text});
  }};
}
test('transactions imported once despite file renames, preview never changes ledger',async()=>{
 const e=env();
 const parsed=e.api.read(t());
 assert.equal(parsed.type,'transactions');
 const preview=e.api.plan(e.state,parsed,'x.csv');
 assert.equal(preview.newSpending,1300);assert.equal(e.state.cashExpenses.length,0);
 const r=await e.import(t(),'a.csv');
 assert.equal(r.added,1);assert.equal(e.state.cashExpenses.length,1);
 assert.equal(e.state.cashExpenses[0].amount,1300);
 assert.equal(e.state.cashExpenses[0].payment_method,'CASH');
 assert.equal(e.state.cashExpenses[0].dedup_key,key);
 assert.equal(e.writes,1);assert.equal(e.backs,1);assert.equal(e.syncs,1);
 const again=await e.import(t(),'different-name.csv');
 assert.equal(again.added,0);assert.equal(e.state.cashExpenses.length,1);
 assert.equal(e.writes,1);
});
test('item CSV alone counts parent once, transactions later enrich and do not add',async()=>{
 const e=env();
 let result=await e.import(items(),'items.csv');
 assert.equal(result.added,1);assert.equal(result.detailItems,2);
 assert.equal(e.state.cashExpenses.length,1);
 assert.equal(e.state.cashExpenses[0].amount,1300);
 assert.equal(e.state.receiptItemDetailsV202.reduce((s,x)=>s+x.amount,0),1300);
 assert.equal(e.state.receiptItemDetailsV202.every(x=>x.count_in_spending===false),true);
 assert.equal(e.state.cashExpenses[0].payment_method,'UNCONFIRMED');
 result=await e.import(t(),'transactions.csv');
 assert.equal(result.added,0);
 assert.equal(e.state.cashExpenses[0].payment_method,'CASH');
 assert.equal(e.state.cashExpenses.length,1);
 assert.equal(e.api.detailsFor(e.state,'cash:0').length,2);
 const again=await e.import(items(),'items-renamed.csv');
 assert.equal(again.added,0);assert.equal(again.detailItems,0);
 assert.equal(e.state.receiptItemDetailsV202.length,2);
});
test('transaction first then item details only updates line registry',async()=>{
 const e=env();
 await e.import(t(),'transactions.csv');
 const result=await e.import(items(),'items.csv');
 assert.equal(result.added,0);assert.equal(result.detailItems,2);
 assert.equal(e.state.cashExpenses.length,1);
 assert.equal(e.state.receiptItemDetailsV202.length,2);
});
test('existing structured CSV is canonical for shared exact receipt key',async()=>{
 const e=env({cashExpenses:[{
  id:'cash-expense:structured:'+key,dedup_key:key,date:'2026-10-31',
  description:'パン屋',amount:1300,payment_method:'CASH',count_in_spending:true
 }]});
 const r=await e.import(t(),'transactions.csv');
 assert.equal(r.added,0);assert.equal(e.state.cashExpenses.length,1);
 const i=await e.import(items(),'details.csv');
 assert.equal(i.added,0);assert.equal(i.detailItems,2);
 assert.equal(e.api.detailsFor(e.state,'cash:0').length,2);
});
test('collision with separate old receipt stops without changing records',async()=>{
 const e=env({cashExpenses:[{
  id:'old',dedup_key:'receipt:other',date:'2026-10-31',
  description:'パン屋',amount:1300,payment_method:'CASH',count_in_spending:true
 }]});
 await assert.rejects(e.import(t()),/二重計上/);
 assert.equal(e.writes,0);assert.equal(e.state.cashExpenses.length,1);
});
test('Amazon four? sample provisional items counted in budget but not settlements',async()=>{
 const e=env();
 const x=await e.import(a(),'amazon-provisional.csv');
 assert.equal(x.added,2);assert.equal(x.provisional,2);
 assert.equal(e.state.cashExpenses.reduce((s,r)=>s+r.amount,0),1789);
 assert.equal(e.state.cashExpenses.every(x=>x.provisional_budget_v202&&
  x.provisional_attribution===true&&x.purchase_confirmed_v202===false),true);
 assert.equal(e.state.cardSettlements.length,0);
 assert.equal(e.state.cashExpenses.every(x=>x.payment_method==='UNCONFIRMED_PROVISIONAL'),true);
 const replay=await e.import(a(),'amazon-copy.csv');
 assert.equal(replay.added,0);assert.equal(e.writes,1);
 assert.match(e.confirmation[0],/送料/);
});
test('ordinary non-purchase Amazon screenshot CSV is not silently counted',async()=>{
 const e=env();
 const c=a().replaceAll('暫定計上','しない');
 await assert.rejects(e.import(c),/暫定計上/);
 assert.equal(e.writes,0);
});
test('duplicate or changed item amount is rejected',()=>{
 const e=env();
 const bad=items().replace('"700"','"701"');
 assert.throws(()=>e.api.read(bad),/一致しません/);
});
test('unknown CSV forwards to existing importer unchanged',async()=>{
 const e=env();
 const result=await e.import('Date,Amount\n2026-10-31,100');
 assert.equal(result.source,'OTHER');assert.equal(e.passthrough,1);
});
test('quoted commas and escaped quotes survive parser',()=>{
 const e=env();
 const list=e.api.parseCsvText('\"a,b\",\"a\"\"b\"\\r\\n');
 assert.equal(list[0][0],'a,b');assert.equal(list[0][1],'a\"b');
});
