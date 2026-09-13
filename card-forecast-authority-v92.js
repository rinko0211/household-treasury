(() => {
  if (window.__cardForecastAuthorityV92) return;
  window.__cardForecastAuthorityV92 = true;

  const stateNow = () => (window.getTreasuryStateRaw || window.getTreasuryState)?.() || {};
  const norm = s => String(s ?? '').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/\.]/g, '').toUpperCase();
  const iso = d => { const x = new Date(d); return Number.isNaN(x.getTime()) ? '' : `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`; };
  const addMonths = (ym,n) => { const [y,m] = String(ym).split('-').map(Number), d = new Date(y,m-1+n,1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; };
  const lastDay = (y,m) => new Date(y,m,0).getDate();
  const dateFor = (ym,day) => { const [y,m] = String(ym).split('-').map(Number); return `${ym}-${String(Math.min(Math.max(1,Number(day)||1),lastDay(y,m))).padStart(2,'0')}`; };

  function canonicalFallback(s){
    const raw = norm(s), n = raw.replace(/カード|CARD/g,'');
    if (!n) return '';
    if (/RAKUTEN|楽天/.test(raw)) return 'RAKUTEN';
    if (/JAL/.test(raw)) return 'JAL';
    if (n === 'D' || /DOCOMO|DCMX/.test(raw)) return 'D_CARD';
    if (/MUFG|三菱UFJ|ミツビシUFJ/.test(raw)) return 'MUFG';
    if (n === 'DC' || /^DC/.test(n)) return 'DC';
    return n;
  }
  const canonical = s => {
    try { return window.householdCardCycleV81?.canonicalCard?.(s) || window.householdPlanningV79?.canonicalCard?.(s) || canonicalFallback(s); }
    catch { return canonicalFallback(s); }
  };
  const sameCard = (a,b) => {
    try { return window.householdCardIdentityV51?.sameCard?.(a,b) ?? (canonical(a) && canonical(a) === canonical(b)); }
    catch { return canonical(a) && canonical(a) === canonical(b); }
  };
  function baselineOf(c){
    for (const v of [c?.monthlyBaselineAmount,c?.cardBaselineAmount,c?.forecastBaseline]) {
      if (v !== null && v !== '' && Number.isFinite(Number(v))) return Math.max(0,Number(v));
    }
    return 0;
  }
  const isDCard = c => canonical(c?.name ?? c) === 'D_CARD';
  const estimateKey = (card,ym) => `ESTIMATE|${norm(card)}|${ym}`;

  function dCardMaster(st, hint){
    const cards = (st.masters?.cards || []).filter(c => c.active !== false && isDCard(c));
    if (!cards.length) return null;
    if (hint) {
      const exact = cards.find(c => sameCard(c.name,hint));
      if (exact) return exact;
    }
    return cards[0];
  }
  function rowMonth(r){ return String(r?.billing_month || r?.date || '').slice(0,7); }
  function isEstimateLike(r){
    const type = String(r?.type || '').toUpperCase(), src = String(r?.source || '').toLowerCase(), name = norm(r?.name || '');
    if (type === 'CARD_ESTIMATE' || src.startsWith('card_estimate')) return true;
    return name.includes('Dカード') && /見込|予測/.test(String(r?.name || ''));
  }
  function isDCardEstimate(r){
    if (!isEstimateLike(r)) return false;
    if (canonical(r?.card) === 'D_CARD') return true;
    const name = norm(r?.name || '');
    return name.includes('Dカード') || name.includes('DOCOMO') || name.includes('DCMX');
  }
  function meaningfulActual(st,card,ym){
    return (st.cardSettlements || []).find(s => sameCard(s.card,card) && String(s.due_date || '').slice(0,7) === ym && Number.isFinite(Number(s.amount)) && Math.abs(Number(s.amount)) > 0) || null;
  }
  function manualOverride(st,card,ym){
    const direct = (st.cardCashflowOverrides || []).find(o => String(o.key || '') === estimateKey(card,ym));
    if (direct) return direct;
    return (st.cardCashflowOverrides || []).find(o => {
      if (String(o.billing_month || o.ym || '') !== ym) return false;
      return sameCard(o.card || o.card_name || '',card);
    }) || null;
  }
  function settlementDay(c){
    for (const v of [c?.settlementDay,c?.paymentDay,c?.dueDay]) {
      const n = Number(v); if (Number.isInteger(n) && n >= 1 && n <= 31) return n;
    }
    return 10;
  }
  function standardName(c){ return `${c?.name || 'dカード'} 標準見込み`; }

  function normalizeRows(input,days=180){
    const st = stateNow(), dcard = dCardMaster(st), base = baselineOf(dcard);
    if (!dcard || base <= 0) return [...(input || [])];

    const from = iso(new Date()), toDate = new Date(`${from}T12:00:00`);
    toDate.setDate(toDate.getDate() + Math.max(0,Number(days)||0));
    const to = iso(toDate), rows = [], seen = new Set();

    for (const original of input || []) {
      const r = {...original};
      if (!isDCardEstimate(r)) { rows.push(r); continue; }
      const ym = rowMonth(r); if (!/^\d{4}-\d{2}$/.test(ym)) { rows.push(r); continue; }
      if (meaningfulActual(st,dcard.name,ym)) continue;
      if (seen.has(ym)) continue;

      const o = manualOverride(st,dcard.name,ym);
      const amount = o ? Math.max(0,Number(o.amount)||0) : base;
      r.card = dcard.name;
      r.billing_month = ym;
      r.type = 'CARD_ESTIMATE';
      r.source = 'card_estimate_v92';
      r.generated = true;
      r.name = o ? `${dcard.name} 月別補正` : standardName(dcard);
      r.amount = -amount;
      if (o?.date) r.date = o.date;
      r.baseline_amount = base;
      r.forecast_method = o ? 'MANUAL_OVERRIDE' : 'D_CARD_STANDARD_EXACT_V92';
      r.baseline_floor_applied = false;
      r.baseline_exact_applied_v91 = false;
      r.standard_forecast_applied_v92 = !o;
      r.card_cashflow_override = !!o;
      r.card_cashflow_override_id = o?.id || null;
      rows.push(r); seen.add(ym);
    }

    const startYm = from.slice(0,7), endYm = to.slice(0,7), day = settlementDay(dcard);
    for (let ym = startYm; ym <= endYm; ym = addMonths(ym,1)) {
      if (seen.has(ym) || meaningfulActual(st,dcard.name,ym)) continue;
      const o = manualOverride(st,dcard.name,ym), date = o?.date || dateFor(ym,day);
      if (date < from || date > to) continue;
      const amount = o ? Math.max(0,Number(o.amount)||0) : base;
      rows.push({
        id:`card-estimate:v92:${norm(dcard.name)}:${ym}`,
        date,
        name:o ? `${dcard.name} 月別補正` : standardName(dcard),
        amount:-amount,
        type:'CARD_ESTIMATE',source:'card_estimate_v92',generated:true,
        record_kind:'FORECAST_EVENT',economic_type:'TRANSFER',estimated:true,
        card:dcard.name,billing_month:ym,
        known_purchase_total:0,scheduled_fixed_total:0,component_count:0,components:{purchases:[],scheduled:[]},
        baseline_amount:base,
        forecast_method:o ? 'MANUAL_OVERRIDE' : 'D_CARD_STANDARD_EXACT_V92',
        baseline_floor_applied:false,standard_forecast_applied_v92:!o,
        card_cashflow_override:!!o,card_cashflow_override_id:o?.id||null,
        settlement_day:day
      });
      seen.add(ym);
    }
    return rows.sort((a,b) => String(a.date||'').localeCompare(String(b.date||'')) || String(a.name||'').localeCompare(String(b.name||''),'ja'));
  }

  function recomputeCore(rows,st=stateNow()){
    let bal = Number(st.settings?.cash) || 0, low = bal, lowDate = iso(new Date());
    const out = [];
    for (const original of rows || []) {
      const e = {...original};
      bal += Number(e.amount) || 0;
      e.balance = bal;
      out.push(e);
      if (bal < low) { low = bal; lowDate = e.date || lowDate; }
    }
    return {rows:out,low,lowDate,endBalance:bal};
  }

  function patchForecast(){
    if (typeof forecast !== 'function') return false;
    if (forecast.__cardForecastAuthorityV93) return true;
    const previousForecast = forecast;
    const authoritativeForecast = function forecastCardAuthorityV93(days=90){
      const requested = Math.max(0,Number(days)||90), st = stateNow();
      const baseResult = previousForecast(requested) || {};
      const core = recomputeCore(normalizeRows(baseResult.rows || [],requested),st);
      let safeBaseLow = core.low;
      if (requested < 180) {
        const safeResult = previousForecast(180) || {};
        safeBaseLow = recomputeCore(normalizeRows(safeResult.rows || [],180),st).low;
      }
      const safety = Math.max(0,Number(baseResult.safetyFloor ?? st.settings?.reserve)||0);
      const reserved = Math.max(0,Number(baseResult.reservedSpecial ?? st.settings?.reservedSpecial)||0);
      const shortTerm = Math.max(0,Number(baseResult.shortTermLiabilities)||0);
      const safeToSpend = Math.max(0,safeBaseLow-safety-reserved-shortTerm);
      return {...baseResult,...core,safeBaseLow,safeToSpend,cardForecastAuthorityVersion:93};
    };
    authoritativeForecast.__cardForecastAuthorityV93 = true;
    forecast = authoritativeForecast;
    return true;
  }

  function enforceMasterPolicy(){
    const st = stateNow(), c = dCardMaster(st), base = baselineOf(c);
    if (!c || base <= 0) return false;
    const mode = String(c.forecastMode || c.forecast_mode || '').toUpperCase();
    let changed = false;
    if (mode !== 'BASELINE') { c.forecastMode = 'BASELINE'; c.forecast_mode = 'BASELINE'; changed = true; }
    if (Number(c.settlementDay || c.paymentDay || c.dueDay) !== settlementDay(c)) { c.settlementDay = settlementDay(c); changed = true; }
    if (changed) {
      c.baselineModeExplicitV92 = 'BASELINE'; c.updatedAt = new Date().toISOString();
      st.masters = st.masters || {}; st.masters.updatedAt = c.updatedAt;
      window.treasuryRecoverySnapshot?.('dカード標準見込みv92補正直前');
      window.replaceTreasuryState?.(st);
      window.setTreasurySaveStatus?.('dカード標準見込みを統一・同期中');
      window.cloudSyncOnLocalSave?.();
    }
    return changed;
  }

  function patchPlanningPolicy(){
    const p = window.householdPlanningV79;
    if (!p || p.__v92Patched) return;
    const oldMode = p.forecastMode?.bind(p), oldAmount = p.forecastAmountForCard?.bind(p);
    p.forecastMode = c => isDCard(c) && baselineOf(c) > 0 ? 'BASELINE' : (oldMode?.(c) || 'COMPONENTS');
    p.forecastAmountForCard = (c,components=0) => isDCard(c) && baselineOf(c) > 0 ? baselineOf(c) : (oldAmount?.(c,components) ?? Math.max(0,Number(components)||0));
    p.__v92Patched = true;
  }

  function refreshConsumers(){
    try { window.renderMobileInteractionV70?.(); } catch {}
    try { window.renderForecastV38?.(); } catch {}
  }

  function install(){
    patchPlanningPolicy();
    enforceMasterPolicy();

    if (typeof generated === 'function' && !window.__generatedCardForecastAuthorityV92) {
      window.__generatedCardForecastAuthorityV92 = true;
      const previousGenerated = generated;
      generated = function generatedCardForecastAuthorityV92(days=90){ return normalizeRows(previousGenerated(days),days); };
    }
    if (typeof window.householdCardForecastV49 === 'function' && !window.__cardPlanAuthorityV92) {
      window.__cardPlanAuthorityV92 = true;
      const previousPlan = window.householdCardForecastV49;
      window.householdCardForecastV49 = function cardPlanAuthorityV92(days=180){
        const plan = structuredClone(previousPlan(days) || {rows:[],warnings:[]});
        plan.rows = normalizeRows(plan.rows,days);
        return plan;
      };
    }
    window.householdCardForecastAuthorityV92 = { normalizeRows, recomputeCore, patchForecast, enforceMasterPolicy, baselineOf, canonical, isDCard };
    patchForecast();
  }

  install();
  setTimeout(() => { install(); refreshConsumers(); },0);
  setTimeout(() => { patchForecast(); refreshConsumers(); },120);
})();
