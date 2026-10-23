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
// Canonical taxonomy only: no untrusted free-text merchant, account or card
// information may be published even by a compromised client.
const MAJOR_NAMES:Record<string,string>={"HOUSING":"住居","UTILITIES":"公共料金","COMMUNICATION":"通信","FOOD":"食費","DAILY_GOODS":"日用品","CHILD":"子ども","MEDICAL":"医療","INSURANCE":"保険","CAR":"車","TRANSPORT":"交通","SUBSCRIPTION":"サブスク・会費","ENTERTAINMENT":"娯楽","TRAVEL":"旅行","EDUCATION":"教育","TAX":"税・公的負担","FINANCIAL_FEES":"金融手数料","PERSONAL":"個人","GIFTS_EVENTS":"イベント・贈答","OTHER":"その他"};
const MINOR_NAMES:Record<string,string>={"HOUSING.RENT_MORTGAGE":"家賃・住宅ローン","HOUSING.HOME_MAINTENANCE":"住宅修繕","HOUSING.OTHER":"その他","UTILITIES.ELECTRICITY":"電気","UTILITIES.WATER":"水道","UTILITIES.GAS":"ガス","UTILITIES.OTHER":"その他","COMMUNICATION.MOBILE":"携帯電話","COMMUNICATION.INTERNET":"インターネット","COMMUNICATION.OTHER":"その他","FOOD.GROCERIES":"食料品","FOOD.EATING_OUT":"外食","FOOD.CAFE":"カフェ","FOOD.OTHER":"その他","DAILY_GOODS.HOUSEHOLD":"生活用品","DAILY_GOODS.CLOTHING":"衣類","DAILY_GOODS.OTHER":"その他","CHILD.CHILDCARE":"保育","CHILD.SCHOOL":"学校","CHILD.GOODS":"子ども用品","CHILD.OTHER":"その他","MEDICAL.CLINIC":"診療","MEDICAL.DENTAL":"歯科","MEDICAL.CONTACTS":"コンタクト","MEDICAL.PHARMACY":"薬局","MEDICAL.OTHER":"その他","INSURANCE.LIFE":"生命保険","INSURANCE.AUTO":"自動車保険","INSURANCE.OTHER":"その他","CAR.FUEL":"燃料","CAR.MAINTENANCE":"整備・修理","CAR.PARKING":"駐車場","CAR.TOLL":"高速・ETC","CAR.OTHER":"その他","TRANSPORT.TRAIN":"鉄道","TRANSPORT.BUS":"バス","TRANSPORT.TAXI":"タクシー","TRANSPORT.AIR":"航空","TRANSPORT.OTHER":"その他","SUBSCRIPTION.DIGITAL":"デジタルサービス","SUBSCRIPTION.MEMBERSHIP":"会員費","SUBSCRIPTION.CARD_FEE":"カード年会費","SUBSCRIPTION.OTHER":"その他","ENTERTAINMENT.HOBBY":"趣味","ENTERTAINMENT.MEDIA":"メディア","ENTERTAINMENT.DINING":"飲食・娯楽","ENTERTAINMENT.OTHER":"その他","TRAVEL.LODGING":"宿泊","TRAVEL.AIR":"航空","TRAVEL.TRANSPORT":"現地交通","TRAVEL.OTHER":"その他","EDUCATION.TUITION":"授業料","EDUCATION.BOOKS":"書籍","EDUCATION.OTHER":"その他","TAX.TAX":"税金","TAX.FEE":"手数料","TAX.OTHER":"その他","FINANCIAL_FEES.INTEREST":"利息","FINANCIAL_FEES.FEE":"手数料","FINANCIAL_FEES.OTHER":"その他","PERSONAL.BEAUTY":"美容","PERSONAL.FITNESS":"フィットネス","PERSONAL.OTHER":"その他","GIFTS_EVENTS.GIFT":"贈り物","GIFTS_EVENTS.EVENT":"イベント","GIFTS_EVENTS.CEREMONY":"冠婚葬祭","GIFTS_EVENTS.OTHER":"その他","OTHER.OTHER":"その他"};
function cleanSnapshot(v:any) {
  if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('集計結果がありません');
  const {period_start,period_end,variable,undetermined,review_count,categories,source_revision}=v;
  const date=/^\d{4}-\d{2}-\d{2}$/;
  if(typeof period_start!=='string'||typeof period_end!=='string'||!date.test(period_start)||!date.test(period_end)||period_start>period_end)
    throw new Error('集計期間が不正です');
  if(!numeric(variable,100000000)||!numeric(undetermined,100000000)||!numeric(review_count,100000)||!numeric(source_revision,1000000000))
    throw new Error('集計額が不正です');
  if(!Array.isArray(categories)||categories.length>30)throw new Error('カテゴリ数が不正です');
  const seen=new Set<string>(),clean=[];
  for(const item of categories){
    if(!numeric(item?.amount,100000000))throw new Error('カテゴリ金額が不正です');
    const hierarchical=Array.isArray(item?.subcategories);
    if(!hierarchical && v.schema_version===2)
      throw new Error('最新版の共有形式に小カテゴリがありません。');
    if(!hierarchical){
      // Backward compatibility for v160 snapshots and still-open owner tabs.
      const label=String(item?.label||'').trim().slice(0,32);
      if(!label||seen.has('old:'+label))throw new Error('カテゴリ内訳が不正です');
      seen.add('old:'+label);clean.push({label,amount:item.amount});
      continue;
    }
    const key=String(item?.key||'');
    if(!Object.hasOwn(MAJOR_NAMES,key)||seen.has('new:'+key))throw new Error('中カテゴリのコードが不正です');
    seen.add('new:'+key);
    if(item.subcategories.length<1||item.subcategories.length>30)throw new Error('小カテゴリの件数が不正です');
    const seenMinor=new Set<string>(),subcategories=[];
    for(const sub of item.subcategories){
      if(!numeric(sub?.amount,100000000))throw new Error('小カテゴリ金額が不正です');
      const subKey=String(sub?.key||''),full=key+'.'+subKey;
      if(!Object.hasOwn(MINOR_NAMES,full)||seenMinor.has(subKey))throw new Error('小カテゴリのコードが不正です');
      seenMinor.add(subKey);
      if(!Array.isArray(sub.days)||sub.days.length<1||sub.days.length>45)throw new Error('利用日内訳が不正です');
      const dates=new Set<string>(),days=[];
      for(const d of sub.days){
        if(!numeric(d?.amount,100000000)||!numeric(d?.count,100000)||d.count<1)throw new Error('利用日内訳の金額が不正です');
        const day=String(d?.date||'');
        if(day!=='undated'&&!date.test(day)||dates.has(day))
          throw new Error('利用日内訳の日付が不正です');
        dates.add(day);days.push({date:day,amount:d.amount,count:d.count});
      }
      if(days.reduce((n,x)=>n+x.amount,0)!==sub.amount)throw new Error('利用日内訳の合計が一致しません');
      subcategories.push({key:subKey,label:MINOR_NAMES[full],amount:sub.amount,days});
    }
    if(subcategories.reduce((n,x)=>n+x.amount,0)!==item.amount)throw new Error('小カテゴリの合計が一致しません');
    clean.push({key,label:MAJOR_NAMES[key],amount:item.amount,subcategories});
  }
  if(clean.reduce((n,x)=>n+x.amount,0)!==variable)throw new Error('変動費の内訳合計が一致しません');
  return {schema_version:2,period_start,period_end,variable,undetermined,review_count,categories:clean,source_revision};
}
Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(req.method!=='POST')return respond({error:'Method not allowed'},405);
  if(req.headers.get('origin') && req.headers.get('origin')!==origin)return respond({error:'Forbidden origin'},403);
  const limit=Number(req.headers.get('content-length')||0);
  if(limit>65536)return respond({error:'Too large'},413);
  let input:any;
  try{const raw=await req.text();if(raw.length>65536)return respond({error:'Too large'},413);input=JSON.parse(raw);}catch{return respond({error:'Invalid request'},400)}
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
    return respond({exists:!!data,enabled:!!data?.enabled,budget:data?.monthly_budget??0,published_at:data?.published_at??null,period_start:data?.snapshot?.period_start??null,period_end:data?.snapshot?.period_end??null,snapshot_version:Number(data?.snapshot?.schema_version??1),source_revision:Number(data?.snapshot?.source_revision??-1)});
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
    // v164: a prior open v160 tab can otherwise overwrite the newer
    // hierarchy with a flat summary, even after the wife page is updated.
    if(input?.snapshot?.schema_version!==2)
      return respond({error:'管理アプリが旧バージョンです。家計アプリを完全に再読み込みしてから、最新の変動費を反映してください。'},409);
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
