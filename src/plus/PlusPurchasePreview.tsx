import * as React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { currentEntitlement, PurchaseFlow, type EntitlementStatus, type PurchaseAdapter, type PurchaseResult, type VerifiedEntitlement } from '../domain/plus/entitlements';
import { PlusButton } from './PlusUI';
import { StudioAction, StudioRow, StudioTitle, studioStyles } from './StudioUI';

const product = { id: 'fixture-only', displayPrice: 'fixture', displayPeriod: 'fixture' };
export const statusNames: Record<EntitlementStatus, string> = {
  unknown: '確認できない', free: '無料', trial_active: '試用中', active: '有効', grace: '猶予中', expired: '満了', revoked: '返金・取消',
};

function evidence(status: Exclude<EntitlementStatus, 'unknown'>): VerifiedEntitlement {
  const at = Date.now();
  return { origin: 'fixture', status, verifiedAt: at, cacheUntil: at + 60 * 60_000, expiresAt: at + 60 * 60_000 };
}

export function createPurchasePreview(initialStatus: Exclude<EntitlementStatus, 'unknown'> = 'active') {
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
  flow.acceptVerified(evidence(initialStatus));
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

export function PlusPurchasePreview({ model, onBack, comparison }: {
  model: ReturnType<typeof createPurchasePreview>; onBack: () => void; comparison?: boolean;
}) {
  const state = React.useSyncExternalStore(model.flow.subscribe, model.flow.snapshot);
  const [showTests, setShowTests] = React.useState(false);
  const status = currentEntitlement(state.evidence, Date.now(), true);
  const checking = state.phase === 'pending' || state.phase === 'checking';
  const busy = checking || ['loading', 'purchasing', 'restoring'].includes(state.phase);
  return <ScrollView style={studioStyles.root} contentContainerStyle={studioStyles.content}>
    <StudioTitle title="Plus の利用状態" back={{ label: '確認画面を閉じる', onPress: onBack }} />
    <View style={styles.hero}>
      <View style={styles.symbol} aria-hidden><Ionicons name="sparkles-outline" size={28} color="#f6e6bd" /></View>
      <View style={studioStyles.grow}>
        <Text style={styles.caption}>比較用 · 請求なし</Text>
        <Text accessibilityRole="header" accessibilityLabel={'現在の試験状態 · ' + statusNames[status]} style={styles.state}>
          {status === 'free' ? '無料版' : 'Plus · ' + statusNames[status]}
        </Text>
      </View>
    </View>
    <StudioRow title="購入を試す" label="購入成功を試す" icon="bag-check-outline" disabled={busy} onPress={() => void model.purchase('success')} />
    <StudioRow title="購入を復元する" label="購入の復元を試す" detail="Plus の利用状態を確認" icon="refresh-outline" disabled={busy}
      onPress={() => void model.flow.restore()} />
    {!!messages[state.phase] && <Text accessibilityLiveRegion="polite" style={studioStyles.status}>{messages[state.phase]}</Text>}
    {checking && <StudioAction label="確認済みの取引を届ける" icon="checkmark" onPress={() => void model.approve()} />}
    {comparison && <StudioAction label={showTests ? '試験条件を閉じる' : '試験条件を変える'} icon="options-outline" onPress={() => setShowTests(!showTests)} />}
    {(!comparison || showTests) && <View style={studioStyles.card}>
      <Text accessibilityRole="header" style={studioStyles.subtitle}>表示する状態</Text>
      <View style={studioStyles.wrap}>{(['free', 'trial_active', 'active', 'grace', 'expired', 'revoked'] as const).map((value) =>
        <PlusButton key={value} label={statusNames[value] + 'を表示'} selected={status === value} onPress={() => model.setStatus(value)} />)}</View>
      <Text accessibilityRole="header" style={studioStyles.subtitle}>購入時の応答</Text>
      <View style={studioStyles.wrap}>
        <StudioAction label="承認待ちを試す" onPress={() => void model.purchase('pending')} disabled={busy} />
        <StudioAction label="キャンセルを試す" onPress={() => void model.purchase('cancelled')} disabled={busy} />
        <StudioAction label="購入失敗を試す" onPress={() => void model.purchase('failed')} disabled={busy} />
        <StudioAction label="未検証の応答を試す" onPress={() => void model.purchase('unverified')} disabled={busy} />
      </View>
    </View>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  hero: { borderRadius: 18, padding: 14, gap: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: '#264d3c' },
  symbol: { width: 54, height: 54, borderRadius: 15, borderWidth: 1, borderColor: '#77917a', backgroundColor: '#365b47', alignItems: 'center', justifyContent: 'center' },
  caption: { color: '#e2e9d6', fontSize: 13, lineHeight: 20 },
  state: { color: '#fffdf0', fontSize: 23, lineHeight: 32, fontWeight: '700' },
});
