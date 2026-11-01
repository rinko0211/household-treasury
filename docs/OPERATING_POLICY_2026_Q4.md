# 2026 Q4–2027 Household Treasury operating decisions

**Status:** Active decision record, confirmed 2026-11-01 (Japan time).  
**Applies to:** financial planning, spending classification, cash-flow forecasts, family sharing, and future coding/analysis of this app.

> This is a public-repository **policy-only** note. Never commit real income, personal budget amounts, account balances, transaction records, family share tokens, cards, or private backup files. Exact budget figures and source evidence belong in the encrypted owner state or private handoff notes.

## Decision priority and effective assumptions

1. **Liquidity recovery is the primary short-term objective.** Avoid new discretionary capital commitments while large one-off purchases are approaching. Track the actual liquid bank/cash buffer separately from economic spending. Unspent budget is available for cash recovery; it is not an invitation to increase discretionary spending.
2. **iDeCo continues; all other NEW recurring/discretionary investments are suspended.** In the current plan, the contribution to investments **other than iDeCo is zero**. iDeCo remains an **investment/cash outflow**, not variable consumption. Do **not** automatically include an earlier long-term aspiration to invest more, model a resumed contribution after a date, or treat a previously discussed investment target as active. Resume requires a fresh, explicit owner decision after checking liquidity and upcoming obligations.
3. **Short-term household spending envelopes are temporary and deliberate.** Use the owner-approved current recurring-cost and variable-cost envelopes from encrypted settings. The variable envelope was designed from a baseline living-spend allowance **plus** a modest overrun cushion, not as an amount that must be fully spent. Do not arbitrarily lower that envelope in a projection without reviewing actual results and the rationale.
4. **Time scope:** through the end of 2026, the provisional plan assumes the specified return-airfare and family-support transfers are **not yet being paid**. This is NOT a permanent exemption. Recalculate the ongoing plan when flights and support begin, likely in 2027; do not silently zero them afterward.
5. **Personal allowances:** track owner and spouse separately from household variable spending. A spouse's already-counted allowance is not counted a second time when itemized personal purchases are later retained as reference-only receipts. Household-family share exposes only variable spending. The sharing snapshot and its published timestamp change **only after the explicit “妻へ反映” action succeeds**.
6. **One-off and special costs:** vehicle seasonal tire fitting and maintenance, appliances, child-carrying e-bike, replacement tires and other extraordinary purchases belong in a dedicated special/one-off plan as appropriate. Annual recurring taxes, insurance and loan bonus repayments need their own due-date reserves. Distinguish genuine one-off purchases from annual recurring charges; do not assume either is a second ordinary variable purchase.
7. **Card, transfer, debt and purchase reconciliation:** card statements and purchase-date expenses represent different events, and card settlement is not new consumption. ATM withdrawals and transfers between owned accounts are not consumption. Vehicle principal repayment is debt use, not ordinary consumption; iDeCo is investing. Preserve source records, financial balances and the audit trail.

## Calculation contract for any cash-recovery projection

```text
Monthly cash capacity =
  confirmed/planned net pay
  - recurring bills and debt principal (excluding the separately shown iDeCo)
  - ordinary variable-spending envelope
  - actually counted personal allowance
  - iDeCo contribution
  - other active investments (CURRENTLY ZERO)
  - known one-offs, seasonal overruns and transfers that genuinely leave the household

Unspent envelope / remaining capacity -> liquid cash recovery first.
```

**Avoid double subtraction.** Check whether iDeCo, household family transfers, loans and other items are included in the actual master/envelope definitions before evaluating the equation. Bonus income should only be treated as available AFTER bonus loan payments, annual charges and planned winter acquisitions.

### Scope & evidence chronology

- **2026-10-17:** Earlier prospective plans considered a higher combined long-term investment goal. This is historical exploration, not today's automatic contribution.
- **2026-10-23–24:** Owner explicitly suspended investments other than iDeCo while cash recovers; clarified that return travel/family-support flows are not included through the end of December. Do not carry forward prospective investment contributions as a current budget line.
- **2026-10-30:** Separate owner/spouse personal allowances; spouse's handed-over allowance is already consumed for budgeting. Do not include personal spending in spouse's shared variable meter.
- **2026-10-31 – 2026-11-01:** Current expense app adds budget percentage/progress bars and reference-only spouse items; spouse sharing's last-updated stamp is an explicit publish time rather than a view/refresh time.
- **2026-11-01 (reconfirmed):** iDeCo is the ONLY continuing planned investment for now. Two-car seasonal tire servicing is a special expense, not a justification to change or exhaust the variable envelope.

### Separate decisions still needed

- **Liquidity restart threshold:** no user-approved numeric balance/target or resume date is recorded in this public note. Never invent one.
- **2027 flight and spouse-family support:** reassess after the actual travel cadence, dates and monthly amounts are confirmed.
- **Winter bonus and large purchases:** reconcile actual invoices with the owner's private balance and already planned loan/annual obligations. Do not infer spare cash from gross bonuses.
- **Private financial state:** this note is **not** a bank entry, budget write, forecast-master edit or automated standing order; do not modify real data just by reading it.

## For developers and assisting agents

Before changing budget defaults, recommending special-spending limits, revising investment forecasts, or answering owner cash-flow questions: read this record; read actual current user-approved encrypted budgets for amounts; keep **discretionary investment = zero** until explicitly instructed otherwise. Do not confuse aspiration and approved active policy. Keep privacy guarantees in README.
