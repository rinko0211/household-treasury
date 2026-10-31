// Budget display remains readonly; the existing family share token and financial totals remain unchanged.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('family/index.html','utf8'),js=fs.readFileSync('family/family.js','utf8'),css=fs.readFileSync('family/family.css','utf8'),sw=fs.readFileSync('sw.js','utf8');
for(const id of ['remaining','spent','budget','budgetRatio','dailyPace','categories'])
 assert.ok(html.includes('id="'+id+'"'),'missing '+id);
assert.ok(html.indexOf('id="spent"')<html.indexOf('id="remaining"'),'spending must be primary');
assert.ok(html.includes('今月使った金額'));
assert.ok(!html.includes('上：使ったお金')&&!html.includes('残り日'),'Remove unnecessary bar caption and day counter');
assert.ok(!html.includes('id="daysLeft"')&&!html.includes('daily-footnote'));
assert.ok(html.includes('id="dailyGuide"'));
assert.ok(js.includes("Math.max(0,left)/days"),'daily guideline derives from budget remainder');
assert.ok(js.includes("timeZone:'Asia/Tokyo'"),'days must use Japanese local date');
assert.ok(js.includes("left<0?'予算オーバー額'"),'negative balance should have an explicit label');
assert.ok(js.includes("$('budgetSection').hidden=budget<=0"),'zero budget must not be treated as remaining');
assert.ok(!html.includes('id="balanceEdit"')&&!html.includes('id="budgetEdit"'),'family view must stay readonly');
assert.ok(html.includes('family.css?v=183')&&html.includes('family.js?v=183'));
assert.ok(sw.includes('./family/family.css?v=183')&&sw.includes('./family/family.js?v=183'));
assert.ok(sw.includes('household-treasury-v191-expense-date-order'));
assert.ok(css.includes('.balance-amount'));
console.log('FAMILY_BUDGET_CLARITY_V173_PASS');
