(function(){
'use strict';
if(window.householdFamilyShareV160)return;
const URL='https://vqgofvnqmformckkkyur.supabase.co/functions/v1/family-variable-share';
const APIKEY='sb_publishable_X0PF6BYxBWXtZPQtU6wzgQ_ud7nY-eO';
const LINK_BASE='https://rinko0211.github.io/household-treasury/family/#';
const STORAGE='householdFamilyShareTokenV160';
const yen=v=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(v)||0);
const $=s=>document.getElementById(s);
const TODAY=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let shareExists=false,enabled=false,budget=0,busy=false,autoTimer=null,lastPublishedRevision=-1;
const context=()=>window.householdShareSyncContext?.()||{};
function setNote(msg,warning=false){const el=$('familyShareNoteV160');if(el){el.textContent=msg;el.style.color=warning?'#f8b66d':'#bcd2e7'}}
function storeToken(token){if(/^[a-f0-9]{64}$/.test(token))localStorage.setItem(STORAGE,token)}
function link(){const token=localStorage.getItem(STORAGE)||'';return /^[a-f0-9]{64}$/.test(token)?LINK_BASE+token:''}
function showLink(){
 const el=$('familyShareLinkV160'),copy=$('familyShareCopyV160');
 if(!el)return;
 const value=enabled?link():'';
 el.value=value||'';
 el.placeholder=enabled?'リンクは別端末で発行されています。再発行すると旧URLは無効になります。':'共有開始後にURLを表示';
 if(copy)copy.disabled=!value;
}
async function api(action,body={}){
 const ctx=context(),jwt=ctx.token;
 if(!jwt)throw Error('既存アプリの「Settings → Realtime端末同期」でサインインしてください。');
 const res=await fetch(URL,{method:'POST',headers:{'Content-Type':'application/json','apikey':APIKEY,'Authorization':'Bearer '+jwt},
  body:JSON.stringify({action,...body}),cache:'no-store'});
 const value=await res.json().catch(()=>({}));
 if(!res.ok)throw Error(value.error||'共有APIに接続できません ('+res.status+')');
 return value;
}
function monthCandidates(now){
 const a=now.slice(0,7), y=Number(a.slice(0,4)),m=Number(a.slice(5,7));
 return [-2,-1,0,1,2].map(d=>{
  const dt=new Date(Date.UTC(y,m-1+d,1));
  return dt.toISOString().slice(0,7);
 });
}
function makeSnapshot(){
 const st=window.getTreasuryState?.(),ledger=window.householdUsageLedgerV157,
  hub=window.householdExpenseUnifiedV148;
 if(!st||!ledger||!hub?.rowDetails)throw Error('支出分類の読み込みが完了していません。');
 const today=TODAY();
 let month=today.slice(0,7);
 for(const candidate of monthCandidates(today)){
   const p=ledger.period(st,candidate,'payday');
   if(p.start<=today&&today<=p.end){month=candidate;break}
 }
 const calc=ledger.calculate(st,month,'payday');
 const categories=new Map();
 let variable=0;
 for(const row of calc.usageRows||[]){
   if(!['cash','purchase','bank'].includes(row.kind)||row.spendingClass==='SPECIAL'||row.costBucket!=='VARIABLE')continue;
   const x=hub.rowDetails(row,st);
   const cat=String(x.category||'OTHER');
   const label=window.householdExpenseAnalyticsV106?.categoryLabel?.(cat)||({
    FOOD:'食費',DINING:'外食',DAILY_GOODS:'日用品',CHILD:'子ども関連',CHILDCARE:'子ども関連',
    TRANSPORT:'交通費',HEALTH:'医療・健康',LEISURE:'娯楽',CLOTHING:'衣服・美容',
    HOUSEHOLD:'生活用品',OTHER:'その他'
   }[cat])||'その他';
   const amount=Math.round(Number(row.amount)||0);
   if(amount<=0)continue;
   variable+=amount;
   categories.set(label,(categories.get(label)||0)+amount);
 }
 const ctx=context();
 const revision=Number(ctx.revision);
 if(!Number.isSafeInteger(revision)||revision<1)throw Error('クラウド同期のrevisionを確認できません。');
 return {
  period_start:calc.start,period_end:calc.end,source_revision:revision,variable,
  undetermined:Math.round(Number(calc.normalUndetermined)||0),
  review_count:Math.max(0,Math.round(Number(calc.reviewCount)||0)),
  categories:[...categories].sort((a,b)=>b[1]-a[1]).map(([label,amount])=>({label,amount}))
 };
}
async function refreshStatus(silent=false){
 if(!context().token){setNote('共有を設定するには家計アプリへのサインインが必要です。',true);return}
 try{
  const r=await api('owner');
  shareExists=!!r.exists;enabled=!!r.enabled;budget=Number(r.budget)||0;
  if($('familyShareBudgetV160'))$('familyShareBudgetV160').value=String(budget);
  if($('familyShareCreateV160'))$('familyShareCreateV160').textContent=shareExists?'リンクを再発行':'共有リンクを作成';
  if($('familyShareStopV160'))$('familyShareStopV160').disabled=!enabled;
  showLink();
  if(!silent)setNote(enabled?'共有中・最終更新 '+(r.published_at?new Date(r.published_at).toLocaleString('ja-JP'):'未更新'):'共有は停止中です。');
 }catch(e){if(!silent)setNote(e.message,true)}
}
async function publish(silent=false){
 const ctx=context();
 if(!ctx.ready||ctx.blocked){if(!silent)throw Error('家計アプリのクラウド同期が完了してから実行してください。');return}
 const snapshot=makeSnapshot();
 if(silent&&snapshot.source_revision===lastPublishedRevision)return;
 const r=await api('publish',{snapshot});
 enabled=!!r.enabled;lastPublishedRevision=snapshot.source_revision;
 showLink();
 setNote('更新済み：変動費 '+yen(snapshot.variable)+' / '+snapshot.period_start+'〜'+snapshot.period_end+
  (snapshot.undetermined?'（未分類 '+yen(snapshot.undetermined)+' あり）':''));
}
function setBusy(v){busy=v;for(const id of ['familyShareCreateV160','familySharePublishV160','familyShareSaveBudgetV160','familyShareStopV160'])if($(id))$(id).disabled=v; }
async function guarded(callback){
 if(busy)return;
 setBusy(true);
 try{await callback()}catch(e){setNote(e.message||String(e),true)}finally{
  setBusy(false);if($('familyShareStopV160'))$('familyShareStopV160').disabled=!enabled;
 }
}
function mount(){
 const cloud=$('cloudDetail')?.closest('.card');
 if(!cloud||$('familySharePanelV160'))return;
 const panel=document.createElement('section');
 panel.id='familySharePanelV160';panel.className='card full';
 panel.style.cssText='margin-top:16px;border:1px solid #397b80';
 panel.innerHTML='<div class="title">家族用・変動費メーター（v160）</div>'+
  '<div class="note">妻の画面はログインなし・閲覧専用。給与・残高・投資・ローンや購入先の明細は共有しません。リンクを知っている人は閲覧できます。</div>'+
  '<div class="form" style="margin-top:12px"><div class="field"><label for="familyShareBudgetV160">給与サイクルの変動費予算（円）</label><input type="number" id="familyShareBudgetV160" min="0" max="5000000" step="1000" value="0"></div>'+
  '<div class="field"><label for="familyShareLinkV160">奥さんに送る閲覧用URL</label><input id="familyShareLinkV160" readonly placeholder="共有開始後にURLを表示"></div></div>'+
  '<div class="controls" style="margin-top:12px;flex-wrap:wrap">'+
  '<button class="btn" id="familyShareCreateV160">共有リンクを作成</button>'+
  '<button class="btn secondary" id="familyShareSaveBudgetV160">予算を保存</button>'+
  '<button class="btn secondary" id="familySharePublishV160">最新の変動費を反映</button>'+
  '<button class="btn secondary" id="familyShareCopyV160" disabled>URLをコピー</button>'+
  '<button class="btn secondary" id="familyShareStopV160" disabled>共有停止</button></div>'+
  '<div id="familyShareNoteV160" class="tiny" style="margin-top:12px">ログイン状態を確認しています。</div>'+
  '<div class="tiny" style="margin-top:8px">自動反映はメインアプリのクラウド同期後に行われます。別端末では閲覧URLを再表示できないため、再発行が必要です。</div>';
 cloud.parentElement.appendChild(panel);
 $('familyShareCreateV160').onclick=()=>guarded(async()=>{
  if(!context().ready||context().blocked)throw Error('まず家計アプリのクラウド同期を完了してください。');
  if(shareExists&&!confirm('リンクを再発行すると、現在の奥さん用URLは使えなくなります。続けますか？'))return;
  const r=await api(shareExists?'rotate':'create');
  shareExists=true;enabled=false;storeToken(r.token);showLink();
  await publish();
  $('familyShareCreateV160').textContent='リンクを再発行';
  setNote('共有を開始しました。URLをコピーして奥さんへ送ってください。');
 });
 $('familySharePublishV160').onclick=()=>guarded(async()=>{if(!shareExists)throw Error('先に共有リンクを作成してください。');await publish()});
 $('familyShareSaveBudgetV160').onclick=()=>guarded(async()=>{
  if(!shareExists)throw Error('先に共有リンクを作成してください。');
  const val=Number($('familyShareBudgetV160').value);
  if(!Number.isSafeInteger(val)||val<0||val>5000000)throw Error('予算は0〜500万円の整数で入力してください。');
  const r=await api('budget',{budget:val});budget=r.budget;setNote('変動費の予算を '+yen(budget)+' に設定しました。');
 });
 $('familyShareStopV160').onclick=()=>guarded(async()=>{
  if(!confirm('奥さんのURLを無効にして共有を停止しますか？'))return;
  await api('disable');enabled=false;showLink();setNote('共有を停止しました。');
 });
 $('familyShareCopyV160').onclick=async()=>{
  const val=link();if(!val||!enabled)return;
  try{await navigator.clipboard.writeText(val);setNote('URLをコピーしました。')}catch{const inp=$('familyShareLinkV160');inp.select();document.execCommand('copy');setNote('URLをコピーしました。')}
 };
 refreshStatus(false);
 setTimeout(()=>refreshStatus(true),1800);
 setTimeout(()=>refreshStatus(true),5500);
}
window.addEventListener('householdShareCloudSyncedV160',()=>{
 clearTimeout(autoTimer);
 if(!enabled||busy)return;
 autoTimer=setTimeout(()=>publish(true).catch(e=>setNote('自動共有に失敗：'+e.message,true)),2000);
});
window.addEventListener('focus',()=>{if($('familySharePanelV160'))refreshStatus(true)});
window.householdFamilyShareV160={mount,makeSnapshot,publish,refreshStatus};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
