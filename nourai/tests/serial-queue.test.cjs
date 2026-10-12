const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../utils/serial-queue.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const loaded = { exports: {} };
new Function('exports', 'module', compiled.outputText)(loaded.exports, loaded);
const { createSerialQueue } = loaded.exports;

test('a slow refresh completes before a save so it cannot overwrite the saved entry', async () => {
  const enqueue = createSerialQueue();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let entries = ['old'];
  const refresh = enqueue(async () => { await gate; entries = []; });
  const save = enqueue(async () => { entries.push('saved'); });
  release();
  await Promise.all([refresh, save]);
  assert.deepEqual(entries, ['saved']);
});
test('failed save propagates its error without poisoning a later refresh', async () => {
  const enqueue = createSerialQueue();
  const save = enqueue(async () => { throw new Error('offline'); });
  const refresh = enqueue(async () => ['server-entry']);
  await assert.rejects(save, /offline/);
  assert.deepEqual(await refresh, ['server-entry']);
});
