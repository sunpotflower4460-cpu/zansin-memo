import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { readCraftEvidence } from '../domain/plus/atelier';
import type { GardenStoreV3 } from '../domain/plus/contracts';
import { craftRecipes, craftRoles } from '../domain/plus/craft';
import { StudioAction, studioColors, studioStyles } from './StudioUI';

export function StudioCraftIngredient({ role, title, quote, use, changed }: {
  role: string; title?: string; quote?: string; use?: string; changed?: boolean;
}) {
  return <View style={styles.source}>
    <Text style={styles.sourceName}>{role}{quote ? ` · ${title || '題名のないメモ'}` : ''}</Text>
    {quote ? <>
      {!!use && <Text style={studioStyles.text}>{use}</Text>}
      {changed && <Text style={styles.origin}>当時の一節 · 元のメモに更新あり</Text>}
      <Text selectable style={styles.quote}>「{quote}」</Text>
    </> : <Text style={studioStyles.muted}>この一節は現在表示できません。</Text>}
  </View>;
}

export function StudioCraftSources({ store, ids, label = '作業台で使った一節' }: {
  store: GardenStoreV3; ids: readonly string[]; label?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = new Set(ids);
  const suggestions = store.atelierSuggestions.filter((entry) => entry.craft && selected.has(entry.id));
  if (!suggestions.length) return null;
  return <View style={styles.stack} testID="studio-craft-sources">
    <StudioAction label={label} icon="layers-outline" expanded={open} onPress={() => setOpen(!open)} />
    {open && suggestions.map((entry) => {
      const craft = entry.craft!;
      return <View key={entry.id} style={studioStyles.card}>
        <Text accessibilityRole="header" style={studioStyles.subtitle}>{craft.title}</Text>
        <Text style={studioStyles.muted}>{craftRecipes.find(({ id }) => id === craft.recipe)?.label} · {craft.generator === 'on_device' ? '端末内AIの案' : 'レシピで組んだ案'}</Text>
        {craft.generator === 'on_device' && <Text style={styles.sourceName}>AIに渡した一節</Text>}
        {entry.evidence.map((item, i) => {
          const excerpt = readCraftEvidence(store, item);
          return <StudioCraftIngredient key={i} role={craftRoles[i] ?? '素材'} title={excerpt?.snapshot.title}
            quote={excerpt?.quote} changed={excerpt?.state === 'changed'} use={craft.uses?.[i]} />;
        })}
      </View>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  stack: { gap: 8 },
  source: { borderLeftWidth: 2, borderColor: '#c7d6c5', paddingLeft: 9, paddingVertical: 3, gap: 2 },
  sourceName: { color: studioColors.green, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  quote: { color: studioColors.muted, fontSize: 13, lineHeight: 20 },
  origin: { color: studioColors.orange, fontSize: 12, lineHeight: 18 },
});
