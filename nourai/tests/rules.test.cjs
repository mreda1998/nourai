const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../utils/rules.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const loaded = { exports: {} };
new Function('exports', 'module', compiled.outputText)(loaded.exports, loaded);
const { userCountry, statusTone, effectiveText, glanceText, RULES_FOOTER, IARC_EXPLAINER } = loaded.exports;

test('the country comes from the device region, falling back to Canada', () => {
  assert.equal(userCountry('fr'), 'FR');
  assert.equal(userCountry(undefined), 'CA');
  assert.equal(userCountry('zzz'), 'CA');
});

test('restrictions are coloured by how much they limit you', () => {
  assert.equal(statusTone('not_authorised'), 'weak');
  assert.equal(statusTone('banned'), 'weak');
  assert.equal(statusTone('warning_label'), 'moderate');
  assert.equal(statusTone('allowed_with_limits'), 'neutral');
  assert.equal(statusTone('allowed'), 'strong');
});

test('dates say since or from', () => {
  const today = new Date('2026-11-04T12:00:00Z');
  assert.equal(effectiveText('2027-01-15', null, today), 'From 15 Jan 2027');
  assert.equal(effectiveText('2022-08-07', null, today), 'Since 2022');
  assert.equal(effectiveText(null, null, today), null);
});

test('the glance line counts ingredients where you live and elsewhere', () => {
  assert.equal(glanceText({ where_you_live: 1, elsewhere: 2 }), '1 ingredient restricted where you live · 2 elsewhere');
  assert.equal(glanceText({ where_you_live: 2, elsewhere: 0 }), '2 ingredients restricted where you live');
  assert.equal(glanceText({ where_you_live: 0, elsewhere: 1 }), '1 ingredient restricted elsewhere');
  assert.equal(glanceText({ where_you_live: 0, elsewhere: 0 }), null);
  assert.equal(glanceText(null), null);
});

test('fixed copy', () => {
  assert.equal(RULES_FOOTER('4 Nov 2026'), 'Rules change. Last checked 4 Nov 2026. Not legal advice.');
  assert.equal(IARC_EXPLAINER, 'This rates whether it can cause cancer, not how likely it is at normal amounts.');
});
