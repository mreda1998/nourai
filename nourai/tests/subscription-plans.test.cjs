const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../utils/subscription-plans.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const loaded = { exports: {} };
new Function('exports', 'module', compiled.outputText)(loaded.exports, loaded);
const { selectSubscriptionPackage } = loaded.exports;
const monthly = { packageType: 'MONTHLY', product: { subscriptionPeriod: 'P1M' } };
const annual = { packageType: 'ANNUAL', product: { subscriptionPeriod: 'P1Y' } };

test('annual selection cannot purchase the first monthly package', () => {
  assert.equal(selectSubscriptionPackage([monthly, annual], 'annual'), annual);
  assert.equal(selectSubscriptionPackage([monthly], 'annual'), undefined);
});
test('monthly selection cannot purchase an annual package', () => {
  assert.equal(selectSubscriptionPackage([annual, monthly], 'monthly'), monthly);
  assert.equal(selectSubscriptionPackage([annual], 'monthly'), undefined);
});
test('missing, lifetime and mismatched billing periods cannot be sold', () => {
  for (const packages of [[], [{ packageType: 'ANNUAL', product: { subscriptionPeriod: null } }],
    [{ packageType: 'ANNUAL', product: { subscriptionPeriod: 'P1M' } }],
    [{ packageType: 'LIFETIME', product: { subscriptionPeriod: null } }]]) {
    assert.equal(selectSubscriptionPackage(packages, 'annual'), undefined);
  }
});
