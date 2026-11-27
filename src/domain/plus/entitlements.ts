import type { PlusCommand } from '../../data/gardenV3Writer';

export type EntitlementStatus = 'unknown' | 'free' | 'trial_active' | 'active' | 'grace' | 'expired' | 'revoked';
type PaidStatus = Extract<EntitlementStatus, 'trial_active' | 'active' | 'grace'>;
export type VerifiedEntitlement = {
  origin: 'verified_store' | 'fixture';
  status: Exclude<EntitlementStatus, 'unknown'>;
  verifiedAt: number;
  cacheUntil: number;
  expiresAt?: number;
  autoRenew?: boolean;
};

export function currentEntitlement(record: VerifiedEntitlement | undefined, at: number, allowFixture = false): EntitlementStatus {
  if (!record || (record.origin === 'fixture' && !allowFixture) || !Number.isFinite(at) ||
      !Number.isFinite(record.verifiedAt) || !Number.isFinite(record.cacheUntil) || at < record.verifiedAt) return 'unknown';
  if (record.status === 'expired' || record.status === 'revoked') return record.status;
  if (record.status === 'free') return at < record.cacheUntil ? 'free' : 'unknown';
  if (record.expiresAt === undefined || !Number.isFinite(record.expiresAt)) return 'unknown';
  if (at >= record.expiresAt) return 'expired';
  return at < record.cacheUntil ? record.status : 'unknown';
}

const paid: Set<EntitlementStatus> = new Set<PaidStatus>(['active', 'trial_active', 'grace']);
export function plusRights(status: EntitlementStatus) {
  const advanced = paid.has(status);
  return { arrangeMap: advanced, atelierAdvanced: advanced, composeWork: advanced, requestFixtureAi: advanced,
    core: true, viewSaved: true, editSavedText: true, reexportSavedWork: true, exportAndDelete: true } as const;
}

export function requirePlusAccess(command: PlusCommand, allowed: () => boolean): PlusCommand {
  return { ...command, apply: (store) => allowed() ? command.apply(store) : { rejected: '利用権を確認してください。入力は残っています。' } };
}

export type StoreProduct = { id: string; displayPrice: string; displayPeriod: string; trialDisclosure?: string };
type Transaction = { id: string; productId: string };
export type PurchaseResult = { kind: 'pending' | 'cancelled' | 'failed' } | { kind: 'transaction'; transaction: Transaction };
export interface PurchaseAdapter {
  products(): Promise<StoreProduct[]>;
  purchase(productId: string): Promise<PurchaseResult>;
  restore(): Promise<Transaction[]>;
  verify(transaction: Transaction): Promise<VerifiedEntitlement | undefined>;
  finish(transaction: Transaction): Promise<void>;
}

export type PurchaseState = {
  evidence?: VerifiedEntitlement;
  products: StoreProduct[];
  phase: 'idle' | 'loading' | 'unavailable' | 'purchasing' | 'pending' | 'cancelled' | 'failed' | 'checking' | 'complete' | 'restoring' | 'nothing_to_restore';
};

/** Coordinates store operations separately from the garden writer. Transaction verification belongs to the adapter. */
export class PurchaseFlow {
  private state: PurchaseState = { phase: 'idle', products: [] };
  private readonly listeners = new Set<() => void>();
  private readonly finished = new Set<string>();
  private readonly finishing = new Map<string, Promise<void>>();
  private busy = false;

  constructor(private readonly adapter: PurchaseAdapter) {}
  snapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<PurchaseState>) { this.state = { ...this.state, ...patch }; for (const listener of this.listeners) listener(); }
  private blocked(): boolean { return this.busy || this.state.phase === 'pending' || this.state.phase === 'checking'; }

  acceptVerified(evidence: VerifiedEntitlement | undefined) {
    if (!evidence || !Number.isFinite(evidence.verifiedAt)) return;
    const previous = this.state.evidence;
    if (previous && (evidence.verifiedAt < previous.verifiedAt ||
        (evidence.verifiedAt === previous.verifiedAt && previous.status === 'revoked' && evidence.status !== 'revoked'))) return;
    this.update({ evidence });
  }

  async load(): Promise<void> {
    if (this.blocked()) return;
    this.update({ products: [] });
    await this.run('loading', async () => {
      const products = (await this.adapter.products()).filter((item) => item.id && item.displayPrice && item.displayPeriod);
      this.update({ products, phase: products.length ? 'idle' : 'unavailable' });
    }, 'unavailable');
  }

  async buy(productId: string): Promise<void> {
    if (this.blocked() || !this.state.products.some(({ id }) => id === productId)) return;
    await this.run('purchasing', async () => {
      const result = await this.adapter.purchase(productId);
      if (result.kind === 'transaction' && result.transaction.productId === productId) await this.handleTransaction(result.transaction);
      else this.update({ phase: result.kind === 'transaction' ? 'failed' : result.kind });
    });
  }

  async restore(): Promise<void> {
    if (this.blocked()) return;
    await this.run('restoring', async () => {
      const transactions = await this.adapter.restore();
      if (!transactions.length) { this.update({ phase: 'nothing_to_restore' }); return; }
      for (const transaction of transactions) await this.handleTransaction(transaction);
    });
  }

  async transactionUpdated(transaction: Transaction): Promise<void> {
    // May arrive while buying or restoring. Finishing the same transaction is coalesced.
    try { await this.handleTransaction(transaction); } catch { this.update({ phase: 'checking' }); }
  }

  private async handleTransaction(transaction: Transaction) {
    this.update({ phase: 'checking' });
    const verified = await this.adapter.verify(transaction);
    if (!verified) return;
    this.acceptVerified(verified);
    if (!this.finished.has(transaction.id)) {
      let pending = this.finishing.get(transaction.id);
      if (!pending) {
        pending = this.adapter.finish(transaction).then(() => { this.finished.add(transaction.id); });
        this.finishing.set(transaction.id, pending);
      }
      try { await pending; } finally { this.finishing.delete(transaction.id); }
    }
    this.update({ phase: 'complete' });
  }

  private async run(phase: PurchaseState['phase'], operation: () => Promise<void>, failure: PurchaseState['phase'] = 'failed') {
    this.busy = true;
    this.update({ phase });
    try { await operation(); }
    catch { this.update({ phase: this.state.phase === 'checking' ? 'checking' : failure }); }
    finally { this.busy = false; }
  }
}
