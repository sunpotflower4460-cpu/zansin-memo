import * as React from 'react';
import { ScrollView, Text } from 'react-native';
import { ConnectionsPanel, type ConnectionsViewMode } from '../components/ConnectionsPanel';
import { SectionCard } from '../components/SectionCard';
import type { GardenStoreV3 } from '../domain/plus/contracts';
import { normalizeSearchText, toSeedSnippet } from '../utils/seedText';
import { Heading, PlusButton, PlusInput, plusStyles } from './PlusUI';

export function PlusComparisonMap({ store }: { store: GardenStoreV3 }) {
  const [centerId, setCenterId] = React.useState<string>();
  const [viewMode, setViewMode] = React.useState<ConnectionsViewMode>('map');
  const [search, setSearch] = React.useState('');
  const seeds = React.useMemo(() => store.seeds.filter((seed) => !seed.deletedAt), [store.seeds]);
  const center = seeds.find((seed) => seed.id === centerId) ?? seeds[0];
  const query = normalizeSearchText(search.trim());
  const matches = query ? seeds.filter((seed) => normalizeSearchText(`${seed.title ?? ''} ${seed.body} ${seed.tags.join(' ')}`).includes(query)) : [];

  function openSeed(seedId: string) {
    setCenterId(seedId);
    setSearch('');
  }

  return <ScrollView contentContainerStyle={plusStyles.page} keyboardShouldPersistTaps="handled">
    <Heading title>無料版の地図</Heading>
    <PlusInput accessibilityLabel="例のメモを探す" placeholder="例のメモを探す" value={search} onChangeText={setSearch} />
    {matches.map((seed) => <PlusButton key={seed.id} label={seed.title ?? toSeedSnippet(seed)} onPress={() => openSeed(seed.id)} />)}
    {query && matches.length === 0 ? <Text style={plusStyles.meta}>見つかるメモがありません。</Text> : null}
    {center && <>
      <SectionCard>
        <Heading>{center.title ?? toSeedSnippet(center)}</Heading>
        <Text selectable style={plusStyles.original}>{center.body}</Text>
      </SectionCard>
      <ConnectionsPanel
        key={center.id}
        center={center}
        seeds={seeds}
        connections={store.connections}
        viewMode={viewMode}
        onChangeViewMode={setViewMode}
        onOpenSeed={openSeed}
      />
    </>}
  </ScrollView>;
}
