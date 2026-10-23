(function(){
'use strict';
const endpoint='https://vqgofvnqmformckkkyur.supabase.co/functions/v1/family-variable-share';
const apikey='sb_publishable_X0PF6BYxBWXtZPQtU6wzgQ_ud7nY-eO';
const $=id=>document.getElementById(id);
const money=v=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(v);
const token=location.hash.slice(1);
let busy=false,openMajor='',openMinor='';
function message(value){$('status').textContent=value}
function element(tag,cls='',label=''){
 const e=document.createElement(tag);if(cls)e.className=cls;
 if(label)e.textContent=label;return e;
}
function rowButton(type,label,amount,count,expanded){
 const button=element('button','breakdown-row '+type);
 button.type='button';button.setAttribute('aria-expanded',String(expanded));
 const left=element('span','row-name'),name=element('span','name-text',label);
 left.append(name);
 if(Number.isInteger(count)&&count>0)left.append(element('span','row-count',' '+count+'件'));
 const right=element('span','row-right');
 right.append(element('strong','money',money(amount)),element('span','chevron',expanded?'⌄':'›'));
 button.append(left,right);return button;
}
function showBreakdown(v){
 const parent=$('categories');
 parent.replaceChildren();
 const categories=Array.isArray(v.categories)?v.categories:[];
 if(!categories.length){parent.append(element('p','empty','この期間の変動費はまだありません'));return}
 for(const [i,major] of categories.entries()){
   const id=major.key||'legacy:'+i,opened=openMajor===id;
   const box=element('div','category');
   const count=Array.isArray(major.subcategories)?
     major.subcategories.reduce((sum,minor)=>sum+(minor.days||[]).reduce((n,d)=>n+(Number(d.count)||0),0),0):null;
   const head=rowButton('major-row',major.label,major.amount,count,opened);
   head.addEventListener('click',()=>{
     if(openMajor===id){openMajor='';openMinor=''}else{openMajor=id;openMinor=''}
     showBreakdown(v);
   });
   box.append(head);
   if(opened){
     const body=element('div','major-body');
     if(!Array.isArray(major.subcategories)||!major.subcategories.length){
       body.append(element('p','empty','小カテゴリは、管理アプリから次回更新された後に表示されます。'));
     }else for(const [j,minor] of major.subcategories.entries()){
       const key=id+'|'+(minor.key||j),expanded=openMinor===key;
       const minorBox=element('div','minor');
       const minorCount=(minor.days||[]).reduce((sum,d)=>sum+(Number(d.count)||0),0);
       const sub=rowButton('minor-row',minor.label,minor.amount,minorCount,expanded);
       sub.addEventListener('click',()=>{
         openMinor=openMinor===key?'':key;
         showBreakdown(v);
       });
       minorBox.append(sub);
       if(expanded){
         const detail=element('div','day-details');
         detail.append(element('div','detail-heading','利用日別の内訳'));
         for(const day of (minor.days||[])){
           const d=element('div','day-row');
           const left=element('span','day-label',
             day.date==='undated'?'日付未確定':String(day.date).replaceAll('-','/'));
           if(day.count>1)left.append(element('span','day-count','（'+day.count+'件）'));
           d.append(left,element('strong','day-amount',money(day.amount)));detail.append(d);
         }
         minorBox.append(detail);
       }
       body.append(minorBox);
     }
     box.append(body);
   }
   parent.append(box);
 }
}
function render(d){
 const v=d.snapshot,spend=Number(v.variable)||0,budget=Number(d.budget)||0;
 $('legacyHint').hidden=Number(v.schema_version||1)>=2&&Array.isArray(v.categories)&&v.categories.every(c=>Array.isArray(c.subcategories));
 $('period').textContent=v.period_start.replaceAll('-','/')+' 〜 '+v.period_end.replaceAll('-','/');
 $('spent').textContent=money(spend);
 $('budgetSection').hidden=budget===0;
 $('budgetEmpty').hidden=budget!==0;
 if(budget>0){
   const left=budget-spend,ratio=Math.round(spend/budget*100);
   $('budget').textContent=money(budget);$('remaining').textContent=money(left);
   $('remainLabel').textContent=left<0?'予算超過額':'あと使える金額';
   $('remaining').classList.toggle('negative',left<0);
   $('progressFill').style.width=Math.max(0,Math.min(100,ratio))+'%';
   $('progressFill').classList.toggle('over',ratio>100);
   $('budgetMeter').setAttribute('aria-valuenow',String(Math.max(0,Math.min(100,ratio))));
   $('budgetRatio').textContent=ratio+'% 使用';
 }
 showBreakdown(v);
 const undetermined=Number(v.undetermined)||0,review=Number(v.review_count)||0;
 $('caution').hidden=!(undetermined||review);
 if(undetermined||review)$('cautionText').textContent=
   (undetermined?'固定・変動未確定 '+money(undetermined)+'。':'')+
   (review?'確認待ち '+review+'件。':'')+
   '管理側で分類されると表示額が変わる場合があります。';
 $('updated').textContent='最終更新 '+new Date(d.published_at).toLocaleString('ja-JP',
  {timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
 const age=Date.now()-new Date(d.published_at).getTime();
 message(age>86400000?'※ 24時間以上更新されていません':'');
}
async function load(){
 if(busy)return;
 if(!/^[a-f0-9]{64}$/.test(token)){
   message('共有用リンクが正しくありません。新しいURLを確認してください。');
   $('categories').textContent='データを表示できません';return;
 }
 busy=true;$('refresh').disabled=true;
 try{
   const res=await fetch(endpoint,{
     method:'POST',headers:{'Content-Type':'application/json','apikey':apikey,'x-share-token':token},
     body:JSON.stringify({action:'view'}),cache:'no-store',referrerPolicy:'no-referrer'
   });
   const data=await res.json().catch(()=>({}));
   if(!res.ok)throw Error(data.error||'情報を取得できません');
   render(data);
 }catch(e){message(e.message+'。共有元の設定をご確認ください。')}
 finally{busy=false;$('refresh').disabled=false}
}
$('refresh').addEventListener('click',load);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});
setInterval(()=>{if(!document.hidden)load()},90000);
load();
})();
