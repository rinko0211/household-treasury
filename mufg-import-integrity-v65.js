(() => {
  if (typeof parseMufg !== 'function' || typeof parseCsv !== 'function') return;
  const previousParseMufg = parseMufg;
  const norm = s => String(s ?? '').normalize('NFKC').replace(/[\s　()（）［］\[\]・\-_/\.]/g, '').toUpperCase();
  const baseKey = p => [String(p.card || ''), String(p.purchase_date || ''), norm(p.merchant_raw || p.merchant_normalized || ''), Math.abs(Number(p.original_amount) || 0)].join('|');

  parseMufg = function parseMufgV65(src, file) {
    const rows = parseCsv(src.text), hi = findHeader(rows, ['確定情報','ご利用日','ご利用金額（円）']);
    if (hi < 0) throw new Error('MUFG/DC/JALカードヘッダーを認識できません。');
    const h = rows[hi].map(x => String(x).replace(/^\uFEFF/, ''));
    const parsed = [];
    let read = 0, duplicates = 0, review = 0, added = 0;
    const occurrenceByInstallment = new Map();

    for (const r of rows.slice(hi + 1)) {
      const o = rowObj(h, r);
      if (o['確定情報'] !== '確定' || !o['ご利用日'] || !o['ご利用店名（海外ご利用店名／海外都市名）']) continue;
      const amount = number(o['ご利用金額（円）']);
      if (amount === null) continue;
      read++;
      const merchant = o['ご利用店名（海外ご利用店名／海外都市名）'];
      const c = classifyMerchant(merchant);
      const purchaseDate = parseDate(o['ご利用日']);
      const billingMonth = parseDate(o['お支払日']).slice(0, 7);
      const installmentCount = number(o['支払回数']);
      const installmentNumber = number(o['何回目']);
      const provisional = {
        card: 'MUFG/DC/JAL', source_file: file.name, purchase_date: purchaseDate,
        merchant_raw: merchant, merchant_normalized: normalizeText(merchant),
        original_amount: Math.abs(amount), category: c.category,
        ordinary_or_special: c.ordinary_or_special,
        payment_method: `${o['支払回数'] || ''} ${o['何回目'] || ''}`.trim(),
        installment_count: installmentCount, installment_number: installmentNumber,
        billing_month: billingMonth, confidence: c.confidence
      };
      const b = baseKey(provisional);
      const installmentToken = Number(installmentNumber) > 0 ? String(installmentNumber) : 'single';
      const occKey = `${b}|${installmentToken}|${billingMonth}`;
      const occurrence = (occurrenceByInstallment.get(occKey) || 0) + 1;
      occurrenceByInstallment.set(occKey, occurrence);
      provisional.occurrence_index = occurrence;
      provisional.purchase_id = hash32(['MUFG/DC/JAL', purchaseDate, normalizeText(merchant), Math.abs(amount), occurrence].join('|'));
      parsed.push(provisional);
    }

    for (const x of parsed) {
      const b = baseKey(x);
      const same = (state.purchaseEvents || []).filter(p => baseKey(p) === b);
      const existingInstance = same.find(p => Number(p.occurrence_index || 1) === Number(x.occurrence_index || 1));
      const installment = Number(x.installment_count) > 1 || Number(x.installment_number) > 1;

      if (existingInstance) {
        // The purchase already exists. Later installment/billing rows update metadata only;
        // they must not create a second economic purchase.
        if (installment) {
          if (!existingInstance.billing_month || String(x.billing_month) < String(existingInstance.billing_month)) existingInstance.billing_month = x.billing_month;
          if (!existingInstance.installment_count && x.installment_count) existingInstance.installment_count = x.installment_count;
        }
        duplicates++;
        continue;
      }

      state.purchaseEvents.push(x);
      if (x.confidence < .7) {
        addReview({source:x.card, date:x.purchase_date, merchant:x.merchant_raw, confidence:x.confidence});
        review++;
      }
      added++;
    }

    return {
      read, added, duplicates, review,
      autoClassified: parsed.filter(x => Number(x.confidence) >= .7 && String(x.category || '') !== 'UNKNOWN').length,
      source: 'MUFG/DC/JAL', latest: parsed.map(x => x.purchase_date).sort().at(-1) || '',
      occurrenceSafe: true
    };
  };

  window.householdMufgImportV65 = { previousParseMufg };
})();
