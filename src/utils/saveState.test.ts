import test from 'node:test';
import assert from 'node:assert/strict';
import { beginSave, finishSave, getSaveStateMessage, settleSaved } from './saveState';

test('beginSave increments request id and moves to saving', () => {
  const started = beginSave(4);
  assert.equal(started.requestId, 5);
  assert.equal(started.state, 'saving');
});

test('finishSave ignores stale save completion', () => {
  const current = { requestId: 8, state: 'saving' as const };
  const staleResult = finishSave(current, 7, { ok: true });
  assert.deepEqual(staleResult, current);
});

test('finishSave updates state for latest completion', () => {
  const current = { requestId: 3, state: 'saving' as const };
  const success = finishSave(current, 3, { ok: true });
  const failure = finishSave(current, 3, { ok: false, reason: 'write_error' });

  assert.equal(success.state, 'saved');
  assert.equal(failure.state, 'error');
});

test('settleSaved clears only latest saved state', () => {
  const saved = { requestId: 5, state: 'saved' as const };
  const cleared = settleSaved(saved, 5);
  const untouched = settleSaved(saved, 4);

  assert.equal(cleared.state, 'idle');
  assert.equal(untouched.state, 'saved');
});

test('getSaveStateMessage maps user-facing messages', () => {
  assert.equal(getSaveStateMessage('saving'), '保存中…');
  assert.equal(getSaveStateMessage('saved'), '保存しました');
  assert.equal(getSaveStateMessage('error'), '保存に失敗しました。端末の空き容量などを確認してください。');
  assert.equal(getSaveStateMessage('idle'), '');
});
