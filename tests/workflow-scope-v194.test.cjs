'use strict';
// Scope legacy regression jobs to their owners. The main Pages job still
// checks every full release; manual dispatch remains available for auditing.
const assert=require('node:assert/strict'),fs=require('node:fs');
const paths=[
 'v77-card-settings.yml','v79-planning-stability.yml',
 'v80-annual-baseline.yml','v81-card-cycle-bank.yml',
 'v82-liquidity-flow.yml','v83-account-transfer.yml',
 'v85-asset-snapshot.yml','v86-card-consistency.yml',
 'v87-revolving-payoff.yml','v88-card-settings-stability.yml',
 'v90-card-forecast-detail.yml','v92-card-forecast-authority.yml',
 'v94-browser-baseline-floor.yml','v96-rakuten-card-cycle.yml',
 'v97-revolving-to-full.yml','v98-revolving-actual-payoff.yml',
 'v98-browser-actual-payoff.yml','v100-asset-chart.yml',
 'v101-cashflow-rollover.yml','v106-cash-expense-analytics.yml'
];
let scoped=0,browser=0;
for(const file of paths){
 const yaml=fs.readFileSync('.github/workflows/'+file,'utf8');
 assert.match(yaml,/\bon:\s*\n\s+push:\s*\n\s+branches:\s*\[main\]\s*\n\s+paths:/,
  file+' must run only for relevant files on main');
 assert.ok(yaml.includes("      - '.github/workflows/"+file+"'"),
  file+' must run when its own workflow changes');
 assert.match(yaml,/workflow_dispatch:/,file+' must preserve manual audit trigger');
 assert.ok(!/^\s*-\s*['"]sw\.js['"]\s*$/m.test(yaml),
  'Changing the shared offline manifest must not run every legacy workflow: '+file);
 assert.ok(!/^\s*-\s*['"]index\.html['"]\s*$/m.test(yaml),
  'Changing HTML should be covered by the full Pages gate, not all legacy workflows: '+file);
 scoped++;
 if(file.includes('browser')||file==='v100-asset-chart.yml')browser++;
}
const pages=fs.readFileSync('.github/workflows/pages.yml','utf8');
assert.match(pages,/push:\s*\n\s+branches:\s*\[main\]/,
 'Every main release still has a full syntax, accounting and deployment gate');
assert.ok(!pages.match(/push:\s*\n\s+branches:\s*\[main\]\s*\n\s+paths:/),
 'Do not path-filter the authoritative Pages gate');
console.log('SCOPED_LEGACY_CI_PASS',scoped,'legacy workflows',browser,'browser checks');
