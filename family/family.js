(function(){
'use strict';
const endpoint='https://vqgofvnqmformckkkyur.supabase.co/functions/v1/family-variable-share';
const apikey='sb_publishable_X0PF6BYxBWXtZPQtU6wzgQ_ud7nY-eO';
const $=id=>document.getElementById(id);
const money=v=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(v);
const token=location.hash.slice(1);
let busy=false;
function message(value){$('status').textContent=value}
function render(d){
 const v=d.snapshot,spend=Number(v.variable)||0,budget=Number(d.budget)||0;
 $('period').textContent=v.period_start.replaceAll('-','/')+' 〜 '+v.period_end.replaceAll('-','/')+' の変動費';
 $('spent').textContent=money(spend);
 $('budgetSection').hidden=budget===0;
 $('budgetEmpty').hidden=budget!==0;
 if(budget>0){
  const left=budget-spend,ratio=Math.round(spend/budget*100);
  $('budget').textContent=money(budget);
  $('remaining').textContent=money(left);
  $('remainLabel').textContent=left<0?'予算オーバー':'あと使える金額';
  $('remaining').classList.toggle('negative',left<0);
  $('progressFill').style.width=Math.max(0,Math.min(100,ratio))+'%';
  $('progressFill').classList.toggle('over',ratio>100);
  $('budgetMeter').setAttribute('aria-valuenow',String(Math.max(0,Math.min(100,ratio))));
  $('budgetRatio').textContent='予算の '+ratio+'% を使用';
 }
 const categories=Array.isArray(v.categories)?v.categories:[];
 const parent=$('categories');parent.replaceChildren();
 if(!categories.length){const p=document.createElement('p');p.className='muted';p.textContent='まだ変動費の登録はありません';parent.append(p)}
 for(const category of categories){
  const row=document.createElement('div');row.className='category';
  const head=document.createElement('div');head.className='category-header';
  const name=document.createElement('span');name.textContent=category.label;
  const amount=document.createElement('strong');amount.textContent=money(category.amount);
  head.append(name,amount);
  const line=document.createElement('div');line.className='bar';
  const fill=document.createElement('div');fill.style.width=(spend?Math.max(0,Math.min(100,category.amount/spend*100)):0)+'%';line.append(fill);
  row.append(head,line);parent.append(row);
 }
 const undetermined=Number(v.undetermined)||0,review=Number(v.review_count)||0;
 $('caution').hidden=!(undetermined||review);
 if(undetermined||review)$('cautionText').textContent=
  (undetermined?'固定費・変動費の未分類 '+money(undetermined)+'。':'')+
  (review?'確認待ちの支出 '+review+'件。':'')+
  '分類が確定すると表示額が変わる場合があります。';
 $('updated').textContent='集計更新 '+new Date(d.published_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
 const age=Date.now()-new Date(d.published_at).getTime();
 message(age>86400000?'※ 24時間以上更新されていません':'');
}
async function load(){
 if(busy)return;
 if(!/^[a-f0-9]{64}$/.test(token)){message('閲覧用リンクが正しくありません。共有した人に新しいURLを確認してください。');$('categories').textContent='データを表示できません';return}
 busy=true;$('refresh').disabled=true;
 try{
  const res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','apikey':apikey,'x-share-token':token},body:JSON.stringify({action:'view'}),cache:'no-store',referrerPolicy:'no-referrer'});
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(data.error||'情報を取得できません');
  render(data);
 }catch(e){message(e.message+'。共有元に確認してください。');}
 finally{busy=false;$('refresh').disabled=false}
}
$('refresh').addEventListener('click',load);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});
setInterval(()=>{if(!document.hidden)load()},90000);
load();
})();