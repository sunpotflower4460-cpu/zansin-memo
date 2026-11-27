import assert from 'node:assert/strict';
import { test } from 'node:test';
import { acceptProposal, chooseExplorationSeeds, dismissProposal, prepareProposals, receiveProposals, reconcileQuota, recordProposalConsent,
  restoreProposalPair, updateSeedPermission, verifyProposals, type ProposalPlan, type ProposalResult } from '../domain/plus/proposals';
import { FixtureProposalTransport } from '../domain/plus/proposalTransport';
import { snapshotSource } from '../domain/plus/sources';
import { disconnectSeeds, softDeleteSeed, updateSeedFields } from '../domain/gardenCommands';
import { emptyStoreV3, parseStoreV3, serializeStoreV3 } from './gardenV3Model';
import { PLUS_KEYS } from './gardenV3Storage';
import { GardenV3Writer, withCoreCommand } from './gardenV3Writer';
import { FakeStorage, makeSeed } from './testSupport';

const at = '2026-11-27T01:00:00.000Z';
const later = '2026-11-27T01:00:03.000Z';
const end = '2026-11-27T01:05:00.000Z';
const seeds = [makeSeed('A', { body: '🌱かえり道。' }), makeSeed('B', { body: 'cafe\u0301と写真' }), makeSeed('C', { body: 'もう一つの材料' })];
const store = () => ({ ...emptyStoreV3(), seeds });
const args = (id = 'request') => ({ requestId: id, consentReceiptId: `consent-${id}`, contextId: 'map', contextGeneration: 1,
  scope: ['A', 'B', 'C'], policyVersion: 'p1', providerDisclosureVersion: 'd1', now: at, expiresAt: end,
  selections: seeds.map(({ id }) => ({ ref: { seedId: id, part: 'body' as const }, selection: 'explicit' as const })),
});

function plan(id?: string) {
  const result = prepareProposals(store(), args(id));
  assert.ok(result);
  return result;
}

function sample(input: ProposalPlan['input']): ProposalResult['proposals'] {
  return [{ pair: ['material-1', 'material-2'], relationKind: 'different_context', hypothesis: '写真と一緒に残す方法が見つかるかもしれません。',
    evidence: input.sources.slice(0, 2).map(({ alias, text }) => ({ alias, quote: text, start: 0, end: text.length })) }];
}

function transport(clock = () => at, period = () => 'period-1') {
  return new FixtureProposalTransport({ now: clock, period, slots: 1, reserveForMs: 2000, resultForMs: 1000, generate: sample });
}

async function deliver(writer: GardenV3Writer, request = plan(), service = transport()) {
  assert.equal((await writer.run(recordProposalConsent(request, at))).ok, true);
  const raw = await service.start(request.input);
  assert.ok(raw);
  assert.equal((await writer.run(receiveProposals(request, raw, 1, at))).ok, true);
  return { raw, service };
}

test('DATA-07: evidence always matches the exact sent UTF-16 range for both ends', async () => {
  const request = plan();
  const result = await transport().start(request.input);
  assert.ok(result);
  assert.equal(verifyProposals(request, result, at)?.proposals[0].evidence[0].quote, '🌱かえり道。');
  const bad = structuredClone(result);
  bad.proposals[0].evidence[0] = { alias: 'material-1', quote: seeds[0].body.slice(0, 1), start: 0, end: 1 };
  assert.equal(verifyProposals(request, bad, at), undefined);
  const normalized = structuredClone(result);
  normalized.proposals[0].evidence[1].quote = seeds[1].body.normalize('NFC');
  assert.equal(verifyProposals(request, normalized, at), undefined);
  bad.proposals[0].evidence[0] = { alias: 'material-3', quote: seeds[2].body, start: 0, end: seeds[2].body.length };
  assert.equal(verifyProposals(request, bad, at), undefined);
  for (const pair of [['material-1', 'material-1'], ['material-1', 'unknown']]) {
    assert.equal(verifyProposals(request, { ...result, proposals: [{ ...result.proposals[0], pair }] }, at), undefined);
  }
  assert.equal(verifyProposals(request, { ...result, proposals: [result.proposals[0], result.proposals[0]] }, at), undefined);
});

test('DATA-04/05: receiving, dismissing and relaunching never connects notes, and adoption uses the core pair once', async () => {
  const writer = new GardenV3Writer(new FakeStorage(), store());
  const request = plan();
  const { raw, service } = await deliver(writer, request);
  await writer.run(receiveProposals(request, raw, 1, at));
  assert.equal(writer.getSnapshot().connectionProposals.length, 1);
  assert.equal(writer.getSnapshot().connections.length, 0);
  const outbox = writer.getSnapshot().outbox[0];
  await writer.run(reconcileQuota(outbox, await service.reconcile(outbox)));
  const id = writer.getSnapshot().connectionProposals[0].id;
  await writer.run(dismissProposal(id, at));
  assert.equal(writer.getSnapshot().connections.length, 0);
  const parsed = parseStoreV3(serializeStoreV3(writer.getSnapshot()));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.store.proposalSuppressions.length, 1);
  await deliver(writer, plan('suppressed'), transport());
  assert.equal(writer.getSnapshot().connectionProposals.length, 1);
  await writer.run(reconcileQuota(writer.getSnapshot().outbox[0], 'not_retained'));
  await writer.run(restoreProposalPair('A', 'B', 'restore'));
  await deliver(writer, plan('new'), transport());
  const newId = writer.getSnapshot().connectionProposals[1].id;
  const accept = acceptProposal({ operationId: 'connect', proposalId: newId, at });
  const result = await Promise.all([writer.run(accept), writer.run(accept)]);
  assert.ok(result.every(({ ok }) => ok));
  assert.equal(writer.getSnapshot().connections.length, 1);
  assert.equal(writer.getSnapshot().connections[0].note, undefined);
  assert.equal(writer.getSnapshot().connections[0].origin, 'manual');
  await writer.run(withCoreCommand(disconnectSeeds({ commandId: 'unlink', a: 'A', b: 'B' })));
  assert.equal(writer.getSnapshot().connectionProposals[1].decision, 'accepted');
  assert.equal(writer.getSnapshot().proposalSuppressions[0].reason, 'connection_removed');
});

test('DATA-06: editing, deletion, consent withdrawal and navigating away invalidate late deliveries', async (t) => {
  for (const kind of ['edit', 'delete', 'deny', 'navigation']) {
    await t.test(kind, async () => {
      const writer = new GardenV3Writer(new FakeStorage(), store());
      const request = plan();
      await writer.run(recordProposalConsent(request, at));
      const service = transport();
      const raw = await service.start(request.input);
      if (kind === 'edit') await writer.run(withCoreCommand(updateSeedFields({ commandId: 'edit', seedId: 'C', patch: { body: '変更後' }, now: at })));
      if (kind === 'delete') await writer.run(withCoreCommand(softDeleteSeed({ commandId: 'delete', seedId: 'A', now: at })));
      if (kind === 'deny') await writer.run(updateSeedPermission('deny', 'C', 0, { externalAi: 'deny' }, at));
      await writer.run(receiveProposals(request, raw, kind === 'navigation' ? 2 : 1, at));
      assert.equal(writer.getSnapshot().connectionProposals.length, 0);
      const entry = writer.getSnapshot().outbox[0];
      assert.equal(entry.kind, 'cancel');
      assert.equal('sources' in entry, false);
      const quota = await service.reconcile(entry);
      assert.notEqual(quota, 'not_retained');
      if (quota === 'not_retained') throw new Error('missing reservation');
      assert.equal(quota.state, 'released');
    });
  }
});

test('DATA-08/09: deny follows derived sources and discovery exclusion is independent of manual selection', async () => {
  const withSprout = store();
  withSprout.seeds = seeds.map((seed) => seed.id !== 'A' ? seed : { ...seed, synthesis: {
    id: 'sprout', statement: '私の考え', createdAt: at, updatedAt: at, promotedAt: at,
    sources: [{ seedId: 'C', sourcePart: 'body', sourceUpdatedAt: at, textSnapshot: seeds[2].body }],
  } });
  const writer = new GardenV3Writer(new FakeStorage(), withSprout);
  await writer.run(updateSeedPermission('hide', 'A', 0, { discovery: 'exclude' }, at));
  const automated = args();
  assert.equal(prepareProposals(writer.getSnapshot(), { ...automated, selections: [{ ...automated.selections[0], selection: 'automatic_in_confirmed_scope' }, automated.selections[1]] }), undefined);
  assert.ok(prepareProposals(writer.getSnapshot(), args()));
  await writer.run(updateSeedPermission('deny', 'C', 0, { externalAi: 'deny' }, at));
  const ref = { seedId: 'A', part: 'synthesis' as const, synthesisId: 'sprout' };
  const historical = snapshotSource(writer.getSnapshot().seeds, ref, 'history', at);
  assert.ok(historical);
  const saved = { ...writer.getSnapshot(), sourceSnapshots: [historical] };
  assert.equal(prepareProposals(saved, { ...args(), selections: [{ ref, snapshotId: historical.id, selection: 'explicit' }, args().selections[1]] }), undefined);
  const normal = plan();
  assert.deepEqual(normal.receipt.processingRootSeedIds, ['A', 'B', 'C']);
  assert.equal(JSON.stringify(normal.input).includes('seedId'), false);
  assert.equal(writer.getSnapshot().aiRequestReceipts.length, 0);
});

test('DATA-13: failed adoption keeps the proposal pending and does not partially connect notes', async () => {
  const storage = new FakeStorage();
  const writer = new GardenV3Writer(storage, store());
  await deliver(writer);
  const id = writer.getSnapshot().connectionProposals[0].id;
  const adoption = acceptProposal({ proposalId: id, operationId: 'adopt', at });
  storage.failNext('setItem', PLUS_KEYS.main);
  assert.equal((await writer.run(adoption)).ok, false);
  assert.equal(writer.getSnapshot().connections.length, 0);
  assert.equal(writer.getSnapshot().connectionProposals[0].decision, 'pending');
  assert.equal((await writer.run(adoption)).ok, true);
  assert.equal(writer.getSnapshot().connections.length, 1);
});

test('DATA-25/26: retries, renewal and late acknowledgements reconcile the original reservation without text', async () => {
  let time = at;
  let period = 'old-period';
  const service = transport(() => time, () => period);
  const writer = new GardenV3Writer(new FakeStorage(), store());
  const request = plan();
  await deliver(writer, request, service);
  await service.start(request.input);
  assert.equal(service.executions(), 1);
  await assert.rejects(service.start({ ...request.input, inputFingerprint: 'other' }), /request_conflict/);
  await assert.rejects(service.start({ ...request.input, sources: request.input.sources.map((entry) => ({ ...entry, text: 'changed' })) }), /request_conflict/);
  time = later;
  period = 'new-period';
  const entry = writer.getSnapshot().outbox[0];
  const late = await service.reconcile(entry);
  assert.deepEqual(late, { reservationId: 'reservation:request', quotaPeriodId: 'old-period', reservationExpiresAt: '2026-11-27T01:00:02.000Z', state: 'released' });
  assert.equal((await writer.run(reconcileQuota(entry, late))).ok, true);
  assert.deepEqual(await service.reconcile(entry), late);
  assert.equal(writer.getSnapshot().outbox.length, 0);
  assert.equal(writer.getSnapshot().connectionProposals.length, 1);
  assert.equal((await service.start(plan('next').input))?.quota.quotaPeriodId, 'new-period');
});

test('ack/cancellation order is terminal and duplicate controls never change accounting', async () => {
  for (const first of ['ack', 'cancel'] as const) {
    const service = transport();
    const req = plan();
    const result = await service.start(req.input);
    assert.ok(result);
    const control = { id: 'control', requestId: req.receipt.id, contextGeneration: 1, createdAt: at };
    const initial = await service.reconcile({ ...control, kind: first });
    assert.deepEqual(await service.reconcile({ ...control, kind: first === 'ack' ? 'cancel' : 'ack' }), initial);
    assert.equal(service.executions(), 1);
    assert.equal(typeof initial !== 'string' && initial.state, first === 'ack' ? 'committed' : 'released');
  }
});

test('automatic exploration remains inside the chosen set, preserves explicit selection, and excludes denied and hidden notes', () => {
  const state = { ...store(), seeds: [...seeds, makeSeed('D', { tags: ['別の分野'] }), makeSeed('E', { tags: ['離れた分野'] })], permissions: [
    { seedId: 'B', externalAi: 'deny' as const, discovery: 'include' as const, epoch: 1, changedAt: at },
    { seedId: 'C', externalAi: 'unasked' as const, discovery: 'exclude' as const, epoch: 0, changedAt: at },
  ] };
  assert.deepEqual(chooseExplorationSeeds(state, 'A', ['A', 'B', 'C', 'D']), ['A', 'D']);
  assert.deepEqual(chooseExplorationSeeds(state, 'A', ['A', 'B', 'C', 'D'], ['C']), ['A', 'C', 'D']);
  assert.equal(state.aiRequestReceipts.length, 0);
});
