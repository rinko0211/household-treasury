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
 const list=e.api.parseCsvText('\"a,b\",\"a\"\"b\"\r\n');
 assert.equal(list[0][0],'a,b');assert.equal(list[0][1],'a\"b');
});


test('large prior ledger replays are indexed without changing monetary output',()=>{
 const existingCash=Array.from({length:14000},(_,i)=>({
  id:'old-cash:'+i, date:'2026-07-01',description:'既存現金店舗'+i,
  amount:i+50,count_in_spending:true
 }));
 const existingCards=Array.from({length:14000},(_,i)=>({
  purchase_id:'old-card:'+i, purchase_date:'2026-07-02',merchant_raw:'既存カード店舗'+i,
  original_amount:i+60,count_in_spending:true
 }));
 const e=env({cashExpenses:existingCash,purchaseEvents:existingCards});
 const rows=Array.from({length:200},(_,i)=>({
  key:'receipt:2026-11-02:bench:'+i+':'+(200+i)+':unit',
  date:'2026-11-02',merchant:'ベンチ店舗'+i,amount:200+i,
  payment:'現金',category:'食費',note:''
 }));
 const parsed={type:'transactions',rows};
 const start=performance.now(),preview=e.api.plan(e.state,parsed,'bench.csv'),elapsed=performance.now()-start;
 assert.equal(preview.newPurchases,200);
 assert.equal(preview.newSpending,rows.reduce((sum,x)=>sum+x.amount,0));
 assert.equal(preview.next.cashExpenses.length,14200);
 assert.equal(preview.next.purchaseEvents.length,14000);
 assert.equal(e.state.cashExpenses.length,14000,'preview must be immutable');
 const replay=e.api.plan(preview.next,parsed,'rename.csv');
 assert.equal(replay.newPurchases,0);
 assert.equal(replay.duplicates,200);
 assert.equal(replay.changed,0);
 console.log('RECEIPT_INDEX_V209_BENCH',JSON.stringify({
  existingRows:28000,receiptRows:200,previewMs:Math.round(elapsed)
 }));
});
test('cash/card matching must reject true same-day same-amount same-merchant collisions',()=>{
 const e=env({purchaseEvents:[{
  purchase_id:'canonical-card',purchase_date:'2026-10-31',merchant_raw:'パン屋',
  original_amount:1300,count_in_spending:true
 }]});
 assert.throws(()=>e.api.plan(e.state,e.api.read(t()),'reject.csv'),/二重計上/);
 assert.equal(e.state.cashExpenses.length,0);
});
test('excluded old sources do not cause overlap, but exact tombstones block re-import',()=>{
 const excluded=env({cashExpenses:[{
  id:'deleted-not-the-current-key',dedup_key:'receipt:other',date:'2026-10-31',
  description:'パン屋',amount:1300,count_in_spending:false,manually_deleted_v192:true
 }]});
 assert.equal(excluded.api.plan(excluded.state,excluded.api.read(t())).newPurchases,1);
 const tombstone=env({cashExpenses:[{
  id:'deleted-exact',dedup_key:key,date:'2026-10-31',
  description:'パン屋',amount:1300,count_in_spending:false,manually_deleted_v192:true
 }]});
 const res=tombstone.api.plan(tombstone.state,tombstone.api.read(t()));
 assert.equal(res.newPurchases,0);assert.equal(res.duplicates,1);
});
test('duplicate receipt ID across cash and card must still be blocked',()=>{
 const e=env({cashExpenses:[{id:'one',dedup_key:key,date:'2026-10-31',description:'パン屋',amount:1300}],
 purchaseEvents:[{purchase_id:'two',receipt_bundle_key_v202:key,purchase_date:'2026-10-31',
 merchant_raw:'パン屋',original_amount:1300}]});
 assert.throws(()=>e.api.plan(e.state,e.api.read(t())),/複数登録/);
});
test('new rows in the same CSV cannot bypass overlap protection with different keys',()=>{
 const e=env();
 const rows=[{key:'receipt:2026-10-31:bake-a:1300',date:'2026-10-31',merchant:'パン屋',amount:1300,payment:'現金'},
 {key:'receipt:2026-10-31:bake-b:1300',date:'2026-10-31',merchant:'パン屋',amount:1300,payment:'現金'}];
 assert.throws(()=>e.api.plan(e.state,{type:'transactions',rows}),/二重計上/);
 assert.equal(e.state.cashExpenses.length,0,'invalid batch cannot mutate the source');
});
test('legacy provisional Amazon record matches by source id even when dedup is missing',()=>{
 const parsed=env().api.read(a());
 const sample=parsed.rows[0];
 const normText=s=>String(s??'').normalize('NFKC').trim().toUpperCase()
  .replace(/[\s　()（）［］\[\]〔〕【】・_\-／/.,，。．]/g,'');
 let hash=2166136261;
 for(const c of normText(sample.label)+'|'+normText(sample.variant)){
  hash^=c.charCodeAt(0);hash=Math.imul(hash,16777619);
 }
 const id='amazon-provisional:'+sample.date+':'+normText(sample.image)+':'+(hash>>>0).toString(16);
 const e=env({cashExpenses:[{id,date:sample.date,amount:sample.amount}]});
 const res=e.api.plan(e.state,{type:'amazon',rows:[sample]});
 assert.equal(res.duplicates,1);
 assert.equal(res.newPurchases,0);
});
