/* Safe private-data-free repair importer for misrouted receipt CSV purchases. */
(() => {
'use strict';
if(window.householdPaymentReclassV159)return;
const FORMAT='HOUSEHOLD_TREASURY_PAYMENT_RECLASS_V159';
const $=id=>document.getElementById(id);
const strict=(x,label)=>{if(!x||typeof x!=='object'||Array.isArray(x))throw Error(label+' が不正です');return x};
function plan(st,patch){
 strict(st,'台帳');strict(patch,'修正パッチ');
 if(patch.format!==FORMAT||!Array.isArray(patch.entries)||patch.entries.length<1||patch.entries.length>100)
   throw Error('形式または件数が不正です');
 const next=structuredClone(st);next.cashExpenses=Array.isArray(next.cashExpenses)?next.cashExpenses:[];
 next.purchaseEvents=Array.isArray(next.purchaseEvents)?next.purchaseEvents:[];
 const ids=new Set(),moving=new Set();let skipped=0,total=0;
 for(const item of patch.entries){
   strict(item,'明細');const b=strict(item.before,'修正前'),p=strict(item.purchase,'修正後');
   if(!b.id||!p.purchase_id||p.source_cash_expense_id!==b.id||ids.has(b.id))throw Error('購入IDが不正または重複です');
   ids.add(b.id);
   if(!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(b.date)||!Number.isSafeInteger(b.amount)||b.amount<=0||
      !b.description||!b.source_file||b.payment_method!=='CASH')throw Error('修正前の厳密照合情報が不正です');
   if(p.purchase_date!==b.date||p.source_file!==b.source_file||Number(p.original_amount)!==b.amount||
      p.economic_type!=='EXPENSE'||!['CREDIT','PAYPAY','TRANSIT_IC'].includes(p.payment_method)||
      !['CARD_PURCHASE','ELECTRONIC_PURCHASE'].includes(p.record_kind))throw Error('修正後の明細が元の領収書と一致しません');
   const old=next.cashExpenses.filter(x=>x.id===b.id);
   const after=next.purchaseEvents.filter(x=>x.purchase_id===p.purchase_id||x.source_cash_expense_id===b.id);
   if(!old.length&&after.length===1){
     if(after[0].source_cash_expense_id!==b.id||Number(after[0].original_amount)!==b.amount)
       throw Error('既適用明細の内容が不一致です');
     skipped++;continue;
   }
   if(old.length!==1||after.length!==0)throw Error('既存明細が未発見または重複しています: '+b.id);
   const x=old[0];
   for(const k of ['id','date','description','amount','source_file','payment_method'])
     if(x[k]!==b[k])throw Error('既存明細の照合不一致: '+b.id+' / '+k);
   moving.add(b.id);next.purchaseEvents.push(structuredClone(p));total+=b.amount;
 }
 if(moving.size)next.cashExpenses=next.cashExpenses.filter(x=>!moving.has(x.id));
 return {next,changed:moving.size,skipped,total};
}
function apply(patch){
 if(typeof window.getTreasuryState!=='function'||typeof window.replaceTreasuryState!=='function'||
    typeof window.treasuryRecoverySnapshot!=='function')throw Error('安全な復旧履歴機能が必要です');
 const before=window.getTreasuryState(),preview=plan(before,patch);
 if(!preview.changed)return preview;
 // Backup is created before any live state mutation.
 window.treasuryRecoverySnapshot('支払方法修正 v159 適用前');
 const current=window.getTreasuryState(),result=plan(current,patch);
 if(result.changed!==preview.changed||result.total!==preview.total)throw Error('プレビュー後に明細が変更されました');
 const saved=window.replaceTreasuryState(result.next);
 if(saved===false)throw Error('台帳の保存結果を確認できません');
 window.cloudSyncOnLocalSave?.();
 window.dispatchEvent(new CustomEvent('treasury:expenses-imported',{detail:{source:FORMAT}}));
 window.householdExpenseUnifiedV148?.render?.();
 return result;
}
function mount(){
 const root=document.querySelector('#imports .grid');if(!root)return;
 if($('paymentRepairV159'))return;
 const box=document.createElement('div');box.className='card full';box.id='paymentRepairV159';
 box.innerHTML='<div class="title">購入時の支払方法修正（v159）</div>'+
 '<p class="tiny">専用の厳密照合パッチJSONだけを受け付けます。通常のバックアップ取込ではありません。既存明細のID・日付・金額・支払方法が全件一致した場合のみ修正します。</p>'+
 '<button type="button" class="btn" id="paymentRepairChooseV159">支払方法修正パッチを選択</button>'+
 '<input type="file" id="paymentRepairFileV159" accept=".json,application/json" style="display:none">'+
 '<p class="tiny" id="paymentRepairStatusV159" role="status"></p>';
 root.prepend(box);
 $('paymentRepairChooseV159').onclick=()=>$('paymentRepairFileV159').click();
 $('paymentRepairFileV159').onchange=async()=>{
   const input=$('paymentRepairFileV159'),file=input.files?.[0],status=$('paymentRepairStatusV159');if(!file)return;
   try{
     if(file.size>200000)throw Error('パッチが大きすぎます');
     const patch=JSON.parse(await file.text()),p=plan(window.getTreasuryState(),patch);
     if(!p.changed){status.textContent='適用済みです。重複追加は行いません。';return}
     if(!confirm(p.changed+'件・'+p.total.toLocaleString('ja-JP')+'円を現金明細から購入イベントへ移します。銀行残高は変更しません。続けますか？'))return;
     const result=apply(patch);status.textContent='修正済み '+result.changed+'件、スキップ '+result.skipped+'件。同期状況をご確認ください。';
   }catch(e){status.textContent='未適用: '+String(e?.message||e)}
   finally{input.value=''}
 };
}
window.householdPaymentReclassV159={FORMAT,plan,apply,mount};
// v161: one unified Import repair desk owns the file picker; strict patch engine remains.
})();
