import assert from 'node:assert/strict';
import { test } from 'node:test';
import { currentEntitlement, plusRights, PurchaseFlow, type PurchaseAdapter, type PurchaseResult, type VerifiedEntitlement } from '../domain/plus/entitlements';

const now = 1_000;
const product = { id: 'test-product', displayPrice: 'test', displayPeriod: 'test' };
const transaction = { id: 'transaction', productId: product.id };
const entitlement = (overrides: Partial<VerifiedEntitlement> = {}): VerifiedEntitlement => ({
  origin: 'verified_store', status: 'active', verifiedAt: now, expiresAt: now + 500, cacheUntil: now + 200, ...overrides,
});

test('offline evidence, expiry, trial and grace observe verified deadlines and a clock rollback fails closed', () => {
  const proof = entitlement({ autoRenew: false });
  assert.equal(currentEntitlement(proof, now + 199), 'active');
  assert.equal(currentEntitlement(proof, now + 200), 'unknown');
  assert.equal(currentEntitlement(proof, now + 500), 'expired');
  assert.equal(currentEntitlement(proof, now - 1), 'unknown');
  assert.equal(currentEntitlement(entitlement({ origin: 'fixture' }), now), 'unknown');
  assert.equal(currentEntitlement(entitlement({ origin: 'fixture', status: 'trial_active' }), now, true), 'trial_active');
  assert.equal(currentEntitlement(entitlement({ status: 'grace' }), now + 1), 'grace');
  assert.equal(currentEntitlement(entitlement({ status: 'grace', expiresAt: undefined }), now), 'unknown');
});

test('expired, refunded and unknown access keep core and saved work rights', () => {
  for (const status of ['free', 'expired', 'revoked', 'unknown'] as const) {
    const rights = plusRights(status);
    assert.equal(rights.core && rights.viewSaved && rights.editSavedText && rights.reexportSavedWork && rights.exportAndDelete, true);
    assert.equal(rights.arrangeMap || rights.atelierAdvanced || rights.composeWork || rights.requestFixtureAi, false);
  }
});

test('pending, cancellation, an unverified response and failure preserve verified access and avoid duplicate purchases', async () => {
  let next: PurchaseResult = { kind: 'pending' };
  const proof = entitlement();
  let verified = false;
  let calls = 0;
  let finished = 0;
  const adapter: PurchaseAdapter = {
    products: async () => [product], purchase: async () => { calls++; return next; }, restore: async () => [], verify: async () => verified ? proof : undefined,
    finish: async () => { finished++; },
  };
  const flow = new PurchaseFlow(adapter);
  await flow.load();
  await Promise.all([flow.buy(product.id), flow.buy(product.id)]);
  assert.equal(calls, 1);
  assert.equal(flow.snapshot().phase, 'pending');
  await flow.buy(product.id);
  assert.equal(calls, 1);
  await flow.transactionUpdated(transaction);
  assert.equal(flow.snapshot().phase, 'checking');
  assert.equal(flow.snapshot().evidence, undefined);
  assert.equal(finished, 0);
  await flow.buy(product.id);
  assert.equal(calls, 1);
  verified = true;
  await Promise.all([flow.transactionUpdated(transaction), flow.transactionUpdated(transaction)]);
  assert.equal(finished, 1);
  assert.deepEqual(flow.snapshot().evidence, proof);
  for (const kind of ['cancelled', 'failed'] as const) {
    next = { kind };
    await flow.buy(product.id);
    assert.equal(flow.snapshot().phase, kind);
    assert.deepEqual(flow.snapshot().evidence, proof);
  }
});

test('restore distinguishes no transaction and failure, and a late active notification cannot reverse a refund', async () => {
  let restored: 'empty' | 'fail' | 'found' = 'empty';
  let record = entitlement();
  const flow = new PurchaseFlow({ products: async () => [], purchase: async () => ({ kind: 'failed' }),
    restore: async () => {
      if (restored === 'fail') throw new Error('offline');
      return restored === 'found' ? [transaction] : [];
    }, verify: async () => record, finish: async () => undefined });
  await flow.restore();
  assert.equal(flow.snapshot().phase, 'nothing_to_restore');
  restored = 'fail';
  await flow.restore();
  assert.equal(flow.snapshot().phase, 'failed');
  restored = 'found';
  await flow.restore();
  assert.equal(flow.snapshot().phase, 'complete');
  flow.acceptVerified(entitlement({ status: 'revoked', verifiedAt: now + 10 }));
  record = entitlement({ verifiedAt: now + 8 });
  await flow.transactionUpdated(transaction);
  assert.equal(flow.snapshot().evidence?.status, 'revoked');
});
