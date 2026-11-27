import * as React from 'react';
import { ScrollView, Text } from 'react-native';
import { SectionCard } from '../components/SectionCard';
import { currentEntitlement, PurchaseFlow, type EntitlementStatus, type PurchaseAdapter, type PurchaseResult, type VerifiedEntitlement } from '../domain/plus/entitlements';
import { Actions, Heading, PlusButton, plusStyles } from './PlusUI';

const product = { id: 'fixture-only', displayPrice: 'fixture', displayPeriod: 'fixture' };
export const statusNames: Record<EntitlementStatus, string> = {
  unknown: '確認できない', free: '無料', trial_active: '試用中', active: '有効', grace: '猶予中', expired: '満了', revoked: '返金・取消',
};

function evidence(status: Exclude<EntitlementStatus, 'unknown'>): VerifiedEntitlement {
  const at = Date.now();
  return { origin: 'fixture', status, verifiedAt: at, cacheUntil: at + 60 * 60_000, expiresAt: at + 60 * 60_000 };
}

export function createPurchasePreview() {
  const transaction = { id: 'fixture-transaction', productId: product.id };
  let action: 'success' | 'pending' | 'cancelled' | 'failed' | 'unverified' = 'success';
  let restored = false;
  let changing = false;
  const adapter: PurchaseAdapter = {
    products: async () => [product],
    purchase: async (): Promise<PurchaseResult> => (action === 'success' || action === 'unverified') ? { kind: 'transaction', transaction } : { kind: action },
    restore: async () => restored ? [transaction] : [],
    verify: async () => action === 'unverified' ? undefined : evidence('active'),
    finish: async () => { restored = true; },
  };
  const flow = new PurchaseFlow(adapter);
  flow.acceptVerified(evidence('active'));
  return {
    flow,
    setStatus: (status: Exclude<EntitlementStatus, 'unknown'>) => flow.acceptVerified(evidence(status)),
    purchase: async (next: typeof action) => {
      if (changing) return;
      changing = true;
      try { action = next; await flow.load(); await flow.buy(product.id); }
      finally { changing = false; }
    },
    approve: async () => { action = 'success'; await flow.transactionUpdated(transaction); },
  };
}

const messages = {
  idle: '', loading: '商品情報の確認中', unavailable: '商品情報を確認できません', purchasing: '試験操作中', pending: '購入の確認を待っています',
  cancelled: '購入操作を閉じました', failed: '操作を完了できませんでした', checking: '取引を確認しています', complete: '試験用の利用権を反映しました',
  restoring: '復元を確認中', nothing_to_restore: '復元できる購入は見つかりませんでした',
};

export function PlusPurchasePreview({ model, onBack }: { model: ReturnType<typeof createPurchasePreview>; onBack: () => void }) {
  const state = React.useSyncExternalStore(model.flow.subscribe, model.flow.snapshot);
  const status = currentEntitlement(state.evidence, Date.now(), true);
  const checking = state.phase === 'pending' || state.phase === 'checking';
  return <ScrollView contentContainerStyle={plusStyles.page}>
    <PlusButton label="確認画面を閉じる" onPress={onBack} />
    <Heading title>利用権の動作確認</Heading>
    <Text style={plusStyles.meta}>開発用の模擬状態です。ストアへの接続や料金の請求はありません。</Text>
    <SectionCard><Heading>現在の試験状態 · {statusNames[status]}</Heading>
      <Actions>{(['free', 'trial_active', 'active', 'grace', 'expired', 'revoked'] as const).map((value) =>
        <PlusButton key={value} label={`${statusNames[value]}を表示`} selected={status === value} onPress={() => model.setStatus(value)} />)}</Actions>
    </SectionCard>
    <SectionCard><Heading>購入と復元の操作</Heading>
      <Actions><PlusButton label="購入成功を試す" onPress={() => void model.purchase('success')} disabled={checking} />
        <PlusButton label="承認待ちを試す" onPress={() => void model.purchase('pending')} disabled={checking} />
        <PlusButton label="キャンセルを試す" onPress={() => void model.purchase('cancelled')} disabled={checking} />
        <PlusButton label="購入失敗を試す" onPress={() => void model.purchase('failed')} disabled={checking} />
        <PlusButton label="未検証の応答を試す" onPress={() => void model.purchase('unverified')} disabled={checking} />
        <PlusButton label="購入の復元を試す" onPress={() => void model.flow.restore()} disabled={checking} />
        {checking && <PlusButton label="確認済みの取引を届ける" onPress={() => void model.approve()} />}
      </Actions>
      <Text accessibilityLiveRegion="polite" style={plusStyles.meta}>{messages[state.phase]}</Text>
      <Text style={plusStyles.meta}>復元の対象は利用権です。この端末のメモや作品は端末に保存されています。</Text>
    </SectionCard>
  </ScrollView>;
}
