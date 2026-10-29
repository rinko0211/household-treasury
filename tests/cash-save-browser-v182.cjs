'use strict';
// Regress the real browser import -> cash detail edit -> persisted storage ->
// full reload path, not only a stubbed semantic editor.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
 const errors=[];
 page.on('pageerror',e=>{const stack=String(e?.stack||e);errors.push(stack);console.error('CASH_V182_PAGEERROR',stack.slice(0,3400))});
 try{
  await page.goto('http://127.0.0.1:4173/?cashSaveE2e=182',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!window.householdExpenseAnalyticsV106&&
   typeof window.openSemanticTransactionEditorV108==='function'&&
   typeof window.replaceTreasuryState==='function',{timeout:20000});
  const content='日付,内容,金額,カテゴリー,区分,サブカテゴリー,支払方法,メモ\n'+
   '2026-10-29,一時預かり保育料,3400,子ども,通常費,CHILDCARE,現金,実際に現金払い\n';
  await page.setInputFiles('#csvInput',{name:'cash-editor-v182.csv',mimeType:'text/csv',buffer:Buffer.from(content)});
  await page.waitForFunction(()=>((window.getTreasuryStateRaw||window.getTreasuryState)().cashExpenses||[])
   .some(x=>x.description==='一時預かり保育料'&&x.amount===3400),{timeout:20000});
  const id=await page.evaluate(()=>((window.getTreasuryStateRaw||window.getTreasuryState)().cashExpenses||[])
   .find(x=>x.description==='一時預かり保育料').id);
  await page.evaluate(id=>window.openSemanticTransactionEditorV108('cash_expense',id),id);
  await page.locator('#transactionEditorV108').waitFor({state:'visible'});
  await page.locator('#transactionRawNameV110').fill('一時預かり保育料（修正済）');
  await page.locator('#transactionRawAmountV110').fill('3600');
  await page.locator('#transactionEditorNatureV159').selectOption('VARIABLE');
  await page.locator('#transactionEditorV108 [data-v108-tx-save]').click();
  await page.waitForFunction(id=>{
    const row=(window.getTreasuryStateRaw||window.getTreasuryState)().cashExpenses.find(x=>x.id===id);
    return !!row&&row.description==='一時預かり保育料（修正済）'&&row.amount===3600&&row.cost_nature==='VARIABLE';
  },id,{timeout:8000});
  const saved=await page.evaluate(id=>{
   const raw=JSON.parse(localStorage.getItem('householdTreasuryMVP')||'{}');
   const row=(raw.cashExpenses||[]).find(x=>x.id===id);
   return {row,count:(raw.cashExpenses||[]).filter(x=>x.id===id).length};
  },id);
  assert.equal(saved.count,1);
  assert.equal(saved.row.amount,3600);
  assert.equal(saved.row.description,'一時預かり保育料（修正済）');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof window.openSemanticTransactionEditorV108==='function',{timeout:20000});
  await page.waitForTimeout(1200); // allow boot migrations and delayed recalculation
  const after=await page.evaluate(id=>{
   const st=(window.getTreasuryStateRaw||window.getTreasuryState)();
   const row=(st.cashExpenses||[]).find(x=>x.id===id);
   return {row,matching:(st.cashExpenses||[]).filter(x=>x.id===id).length};
  },id);
  assert.equal(after.matching,1,'Reload must not duplicate an edited cash expense');
  assert.equal(after.row.amount,3600,'Edited cash amount must survive page reload');
  assert.equal(after.row.description,'一時預かり保育料（修正済）','Edited cash label must survive page reload');
  // A second editing session with an unchanged payment method must still be saved.
  await page.evaluate(id=>window.openSemanticTransactionEditorV108('cash_expense',id),id);
  await page.locator('#transactionRawAmountV110').fill('3700');
  await page.locator('#transactionEditorV108 [data-v108-tx-save]').click();
  await page.waitForFunction(id=>(window.getTreasuryStateRaw||window.getTreasuryState)()
    .cashExpenses.find(x=>x.id===id)?.amount===3700,id);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof window.openSemanticTransactionEditorV108==='function');
  const final=await page.evaluate(id=>((window.getTreasuryStateRaw||window.getTreasuryState)()
    .cashExpenses||[]).find(x=>x.id===id),id);
  assert.equal(final.amount,3700);
  assert.equal(final.payment_method,'CASH');
  assert.equal(final.description,'一時預かり保育料（修正済）');
  await page.screenshot({path:'cash-save-browser-v182.png',fullPage:true});
  console.log('CASH_SAVE_BROWSER_V182_PASS',JSON.stringify({id,amount:final.amount,category:final.category,errorCount:errors.length}));
  if(errors.length)throw Error('Browser errors: '+errors.join(' / '));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
