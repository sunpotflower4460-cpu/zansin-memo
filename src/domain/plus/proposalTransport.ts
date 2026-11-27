import type { AiOutboxEntry, QuotaReceipt } from './contracts';
import type { ProposalInput, ProposalResult } from './proposals';

export interface ProposalTransport {
  start(input: ProposalInput): Promise<unknown>;
  reconcile(entry: AiOutboxEntry): Promise<QuotaReceipt | 'not_retained'>;
}

type Reservation = { fingerprint: string; quota: QuotaReceipt; result?: ProposalResult; resultExpiresAt: string };

/** In-process test adapter. Its limits and stored records are controlled by the test or preview. */
export class FixtureProposalTransport implements ProposalTransport {
  private readonly records = new Map<string, Reservation>();
  private calls = 0;

  constructor(private readonly options: {
    now: () => string; period: () => string; reserveForMs: number; resultForMs: number; slots: number;
    generate: (input: ProposalInput) => ProposalResult['proposals'];
  }) {}

  executions(): number { return this.calls; }

  private expire(record: Reservation, now: string): void {
    if (record.quota.state === 'reserved' && record.quota.reservationExpiresAt <= now) record.quota.state = 'released';
    if (record.resultExpiresAt <= now) record.result = undefined;
  }

  async start(input: ProposalInput): Promise<ProposalResult | undefined> {
    const now = this.options.now();
    const previous = this.records.get(input.requestId);
    if (previous) {
      this.expire(previous, now);
      if (previous.fingerprint !== input.inputFingerprint) throw new Error('request_conflict');
      return previous.quota.state === 'released' || !previous.result ? undefined : { ...previous.result, quota: { ...previous.quota } };
    }
    const period = this.options.period();
    const current = [...this.records.values()];
    current.forEach((record) => this.expire(record, now));
    if (current.some((record) => record.quota.state === 'reserved') ||
        current.filter((record) => record.quota.quotaPeriodId === period && record.quota.state === 'committed').length >= this.options.slots) throw new Error('quota_unavailable');
    const quota: QuotaReceipt = { reservationId: `reservation:${input.requestId}`, quotaPeriodId: period, state: 'reserved',
      reservationExpiresAt: new Date(Date.parse(now) + this.options.reserveForMs).toISOString() };
    const record: Reservation = { fingerprint: input.inputFingerprint, quota,
      resultExpiresAt: new Date(Date.parse(now) + this.options.resultForMs).toISOString() };
    this.records.set(input.requestId, record);
    this.calls++;
    try {
      const proposals = this.options.generate(input);
      if (!proposals.length) quota.state = 'released';
      const result: ProposalResult = { requestId: input.requestId, inputFingerprint: input.inputFingerprint, resultId: `result:${input.requestId}`,
        modelVersion: 'fixture', promptVersion: 'fixture-v1', proposals, quota: { ...quota } };
      record.result = result;
      return result;
    } catch (error) {
      quota.state = 'released';
      throw error;
    }
  }

  async reconcile(entry: AiOutboxEntry): Promise<QuotaReceipt | 'not_retained'> {
    const record = this.records.get(entry.requestId);
    if (!record) return 'not_retained';
    if ((entry.reservationId && entry.reservationId !== record.quota.reservationId) ||
        (entry.quotaPeriodId && entry.quotaPeriodId !== record.quota.quotaPeriodId)) throw new Error('reservation_conflict');
    this.expire(record, this.options.now());
    if (entry.kind === 'cancel') {
      if (record.quota.state === 'reserved') record.quota.state = 'released';
      record.result = undefined;
    }
    if (entry.kind === 'ack' && record.quota.state === 'reserved') record.quota.state = 'committed';
    return { ...record.quota };
  }
}
