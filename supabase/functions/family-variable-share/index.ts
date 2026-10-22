import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const PUBLISHABLE = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const client = createClient(URL, SERVICE, {auth:{persistSession:false,autoRefreshToken:false}});
const origin = 'https://rinko0211.github.io';
const cors = {
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type,authorization,apikey,x-share-token',
  'Vary': 'Origin'
};
const headers = {...cors,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, max-age=0','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
const respond = (body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
const numeric = (n:unknown,max=5000000)=>Number.isSafeInteger(n)&&Number(n)>=0&&Number(n)<=max;
const sha = async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(b=>b.toString(16).padStart(2,'0')).join('');
const tokenNew = ()=>Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b=>b.toString(16).padStart(2,'0')).join('');
const table='family_variable_shares';
function cleanSnapshot(v:any) {
  if(!v || typeof v!=='object'||Array.isArray(v))throw new Error('集計結果がありません');
  const {period_start,period_end,variable,undetermined,review_count,categories,source_revision}=v;
  const date=/^\d{4}-\d{2}-\d{2}$/;
  if(typeof period_start!=='string'||typeof period_end!=='string'||!date.test(period_start)||!date.test(period_end)||period_start>period_end)throw new Error('集計期間が不正です');
  if(!numeric(variable,100000000)||!numeric(undetermined,100000000)||!numeric(review_count,100000)||!numeric(source_revision,1000000000))throw new Error('集計額が不正です');
  if(!Array.isArray(categories)||categories.length>30)throw new Error('カテゴリ数が不正です');
  const seen=new Set<string>(),clean=[];
  for(const item of categories){
    const label=String(item?.label||'').trim().slice(0,32);
    if(!label||!numeric(item?.amount,100000000)||seen.has(label))throw new Error('カテゴリ内訳が不正です');
    seen.add(label);clean.push({label,amount:item.amount});
  }
  if(clean.reduce((n,x)=>n+x.amount,0)!==variable)throw new Error('変動費の内訳合計が一致しません');
  return {period_start,period_end,variable,undetermined,review_count,categories:clean,source_revision};
}
Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(req.method!=='POST')return respond({error:'Method not allowed'},405);
  if(req.headers.get('origin') && req.headers.get('origin')!==origin)return respond({error:'Forbidden origin'},403);
  const limit=Number(req.headers.get('content-length')||0);
  if(limit>16000)return respond({error:'Too large'},413);
  let input:any;
  try{const raw=await req.text();if(raw.length>16000)return respond({error:'Too large'},413);input=JSON.parse(raw);}catch{return respond({error:'Invalid request'},400)}
  const action=String(input?.action||'');
  if(action==='view'){
    const token=String(req.headers.get('x-share-token')||'');
    if(!/^[a-f0-9]{64}$/.test(token))return respond({error:'閲覧リンクが無効です'},404);
    const hash=await sha(token);
    const {data,error}=await client.from(table).select('snapshot,monthly_budget,published_at').eq('token_hash',hash).eq('enabled',true).maybeSingle();
    if(error)return respond({error:'共有データの取得に失敗しました'},503);
    if(!data?.snapshot)return respond({error:'閲覧リンクが無効または共有停止中です'},404);
    return respond({snapshot:data.snapshot,budget:data.monthly_budget,published_at:data.published_at});
  }
  const auth=req.headers.get('authorization')||'';
  if(!/^Bearer\s+.+/i.test(auth))return respond({error:'サインインが必要です'},401);
  const bearer=auth.replace(/^Bearer\s+/i,'');
  const authClient=createClient(URL,PUBLISHABLE,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:userData,error:authError}=await authClient.auth.getUser(bearer);
  if(authError||!userData.user?.id)return respond({error:'認証が無効です'},401);
  const uid=userData.user.id;
  if(action==='owner'){
    const {data,error}=await client.from(table).select('enabled,monthly_budget,published_at,snapshot').eq('owner_user_id',uid).maybeSingle();
    if(error)return respond({error:'共有状態を取得できません'},503);
    return respond({exists:!!data,enabled:!!data?.enabled,budget:data?.monthly_budget??0,published_at:data?.published_at??null,period_start:data?.snapshot?.period_start??null,period_end:data?.snapshot?.period_end??null});
  }
  if(action==='create'||action==='rotate'){
    if(action==='rotate'){
      const {data}=await client.from(table).select('owner_user_id').eq('owner_user_id',uid).maybeSingle();
      if(!data)return respond({error:'共有を先に作成してください'},404);
    }else{
      const {data}=await client.from(table).select('owner_user_id').eq('owner_user_id',uid).maybeSingle();
      if(data)return respond({error:'共有は作成済みです。リンクの再発行を使用してください'},409);
    }
    const token=tokenNew(),hash=await sha(token);
    const record={owner_user_id:uid,token_hash:hash,enabled:false,updated_at:new Date().toISOString()};
    const {error}=await client.from(table).upsert(record,{onConflict:'owner_user_id'});
    if(error)return respond({error:'共有リンクの発行に失敗しました'},503);
    return respond({token,enabled:false});
  }
  if(action==='disable'){
    const {error}=await client.from(table).update({enabled:false,updated_at:new Date().toISOString()}).eq('owner_user_id',uid);
    if(error)return respond({error:'共有停止に失敗しました'},503);
    return respond({enabled:false});
  }
  if(action==='budget'){
    if(!numeric(input?.budget))return respond({error:'予算は0〜500万円の整数で入力してください'},400);
    const {data,error}=await client.from(table).update({monthly_budget:input.budget,updated_at:new Date().toISOString()}).eq('owner_user_id',uid).select('monthly_budget').maybeSingle();
    if(error||!data)return respond({error:'予算を保存できません'},503);
    return respond({budget:data.monthly_budget});
  }
  if(action==='publish'){
    let snapshot;
    try{snapshot=cleanSnapshot(input?.snapshot)}catch(e){return respond({error:(e as Error).message},400)}
    const {data:prev,error:readError}=await client.from(table).select('snapshot').eq('owner_user_id',uid).maybeSingle();
    if(readError||!prev)return respond({error:'共有リンクが未設定です'},409);
    const oldRev=Number(prev.snapshot?.source_revision??-1);
    if(snapshot.source_revision<oldRev)return respond({error:'古いデータからの上書きを防止しました。家計アプリを同期してください'},409);
    const now=new Date().toISOString();
    const {error}=await client.from(table).update({snapshot,enabled:true,published_at:now,updated_at:now}).eq('owner_user_id',uid);
    if(error)return respond({error:'集計の更新に失敗しました'},503);
    return respond({enabled:true,published_at:now});
  }
  return respond({error:'Unknown action'},400);
});
