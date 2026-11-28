import { Ionicons } from '@expo/vector-icons';
import * as React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { theme } from '../styles/theme';
import { StudioRow, StudioTitle, studioColors, studioStyles, type StudioIcon } from './StudioUI';

function LibraryTile({ label, title, detail, icon, count, warm, onPress }: {
  label: string; title: string; detail: string; icon: StudioIcon; count: number; warm?: boolean; onPress: () => void;
}) {
  const ink = warm ? '#754b37' : studioColors.green;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={count ? `${detail}。保存済み${count}件` : detail} onPress={onPress}
    style={({ pressed }) => [styles.tile, warm && styles.warm, pressed && studioStyles.quiet]}>
    <View style={styles.tileTop}>
      <View style={[styles.tileIcon, warm && styles.warmIcon]} aria-hidden><Ionicons name={icon} size={26} color={ink} /></View>
      <Ionicons name="arrow-forward" size={17} color={ink} />
    </View>
    <Text style={styles.tileTitle}>{title}</Text>
    <Text style={[studioStyles.muted, styles.tileDetail]}>{detail}</Text>
    {count > 0 && <Text style={[styles.count, { color: ink }]}>{count}件</Text>}
  </Pressable>;
}

export function StudioMore({ drafts, works, onAtelier, onCollection, onArrange, onSavedMaps, onPurchase, onData }: {
  drafts: number; works: number; onAtelier?: () => void; onCollection?: () => void;
  onArrange?: () => void; onSavedMaps: () => void; onPurchase?: () => void; onData: () => void;
}) {
  const [mapTools, setMapTools] = React.useState(false);
  if (mapTools) return <ScrollView style={studioStyles.root} contentContainerStyle={studioStyles.content}>
    <StudioTitle title="地図を整える" back={{ label: 'その他に戻る', onPress: () => setMapTools(false) }} />
    {onArrange && <StudioRow title="カードを動かす" detail="マインドマップの配置を編集" icon="move-outline" onPress={onArrange} />}
    <StudioRow title="表示するメモを選ぶ" detail="範囲・まとまり・保存した地図" icon="layers-outline" onPress={onSavedMaps} />
  </ScrollView>;
  return <ScrollView style={studioStyles.root} contentContainerStyle={studioStyles.content}>
    <StudioTitle title="その他" />
    {(onAtelier || onCollection) && <View style={styles.library}>
      {onAtelier && <LibraryTile label="アトリエを開く" title="アトリエ" detail="メモから下書きを育てる" icon="create-outline" count={drafts} onPress={onAtelier} />}
      {onCollection && <LibraryTile label="作品集を開く" title="作品集" detail="カードや地図を残す" icon="albums-outline" count={works} warm onPress={onCollection} />}
    </View>}
    <View style={styles.rows}>
      <StudioRow label="地図の範囲・配置を編集" title="地図を整える" detail="カードの配置・表示範囲" icon="git-network-outline" onPress={() => setMapTools(true)} />
      {onPurchase && <StudioRow label="購入と復元を試す" title="Plus の利用状態" detail="購入・復元のテスト" icon="sparkles-outline" onPress={onPurchase} />}
      <StudioRow label="データを書き出す・削除する" title="データ管理" detail="書き出し・削除" icon="folder-outline" onPress={onData} />
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  library: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  tile: { flex: 1, minWidth: 0, minHeight: 145, padding: 11, gap: 3, backgroundColor: '#e9efe3',
    borderColor: '#cfdccc', borderRadius: 17, borderWidth: 1 },
  warm: { backgroundColor: '#f3eade', borderColor: '#e7d8c5' },
  tileTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 5 },
  tileIcon: { width: 44, height: 44, borderRadius: 13, backgroundColor: '#f6f9ef', alignItems: 'center', justifyContent: 'center' },
  warmIcon: { backgroundColor: '#fff6e9' },
  tileTitle: { color: studioColors.text, fontSize: 20, lineHeight: 28, fontWeight: '700', fontFamily: theme.fonts.serif },
  tileDetail: { flexGrow: 1 },
  count: { fontSize: 12, fontWeight: '700', paddingTop: 2 },
  rows: { gap: 7 },
});
