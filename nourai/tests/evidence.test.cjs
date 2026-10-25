const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../utils/evidence.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const loaded = { exports: {} };
new Function('exports', 'module', compiled.outputText)(loaded.exports, loaded);
const { verdictLabel, verdictTone, certaintyLabel, studyStrength, studyMeta, studiesForClaim } = loaded.exports;

test('certainty sets the wording, as in Cochrane plain language: works, probably works, may work', () => {
  assert.equal(verdictLabel('benefit', 'strong', 'high'), 'Works');
  assert.equal(verdictLabel('benefit', 'moderate', 'moderate'), 'Probably works');
  // Ashwagandha for stress: a real effect on low-certainty evidence.
  assert.equal(verdictLabel('benefit', 'moderate', 'low'), 'May work');
  assert.equal(verdictTone('benefit', 'moderate', 'low'), 'moderate');
  assert.equal(verdictLabel('benefit', 'limited', 'very_low'), 'Too early to tell');
  assert.equal(verdictLabel('benefit', 'unlikely', 'moderate'), 'Probably doesn’t work');
  assert.equal(verdictTone('benefit', 'unlikely', 'moderate'), 'weak');
  assert.equal(verdictLabel('benefit', 'mixed', 'low'), 'Mixed results');
  assert.equal(verdictLabel('benefit', null, null), 'Not enough research');
});

test('safety claims state a risk, so a supported claim is bad news', () => {
  assert.equal(verdictLabel('safety', 'moderate', 'moderate'), 'Likely risk');
  assert.equal(verdictTone('safety', 'moderate', 'moderate'), 'weak');
  assert.equal(verdictLabel('safety', 'moderate', 'low'), 'Possible risk');
  // Sucralose and insulin: good evidence the feared effect isn't there.
  assert.equal(verdictLabel('safety', 'unlikely', 'moderate'), 'No sign of this risk');
  assert.equal(verdictTone('safety', 'unlikely', 'moderate'), 'strong');
  assert.equal(verdictLabel('safety', 'unlikely', 'low'), 'No clear sign of this risk');
  assert.equal(verdictTone('safety', 'unlikely', 'low'), 'neutral');
  assert.equal(certaintyLabel('very_low'), 'Very low certainty');
});

test('a study’s strength comes from its appraisal, falling back to the old confidence label', () => {
  assert.deepEqual(studyStrength({ quality_tier: 'low', confidence: 'high' }), { label: 'Weak study', tone: 'weak' });
  assert.deepEqual(studyStrength({ confidence: 'high' }), { label: 'High confidence', tone: 'strong' });
});

test('the meta line says how the study was done in a few words', () => {
  assert.equal(
    studyMeta({ study_type: 'rct', sample_size: 140, duration_weeks: 12, year: 2020 }),
    'Randomised trial · 140 people · 12 weeks · 2020',
  );
  assert.equal(studyMeta({ study_type: 'meta_analysis', sample_size: null, year: 2018 }), 'Meta-analysis · 2018');
  assert.equal(studyMeta({ study_type: 'rct', sample_size: 1, duration_weeks: 0.14, year: null }), 'Randomised trial · 1 person · 1 day');
});

test('a claim’s studies keep the claim’s order and carry their stance', () => {
  const evidence = [{ id: 'a', finding: 'A' }, { id: 'b', finding: 'B' }, { id: 'c', finding: 'C' }];
  const claim = { studies: [{ evidence_id: 'c', stance: 'refutes' }, { evidence_id: 'a', stance: 'supports' }, { evidence_id: 'gone', stance: 'supports' }] };
  const result = studiesForClaim(claim, evidence);
  assert.deepEqual(result.map((s) => [s.study.id, s.stance]), [['c', 'refutes'], ['a', 'supports']]);
});
