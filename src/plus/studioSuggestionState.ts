import * as React from 'react';
import type { GardenStoreV3 } from '../domain/plus/contracts';
import { rankInsights, shortlistInsights } from '../domain/plus/insights';
import type { MapIndex } from '../domain/plus/map';
import { compareSemantics, prepareSemanticModel } from './studioLanguage';

type Analysis = Awaited<ReturnType<typeof compareSemantics>>;
const noSuggestions = [] as ReturnType<typeof rankInsights>;

export function useStudioSuggestions(store: GardenStoreV3, index: MapIndex, centerId: string, active: boolean) {
  const [useModel, setUseModel] = React.useState(false);
  const [retry, refresh] = React.useReducer((count: number) => count + 1, 0);
  const [analysis, setAnalysis] = React.useState<{ shortlist: ReturnType<typeof shortlistInsights>; retry: number; result: Analysis }>();
  const [preparing, setPreparing] = React.useState(false);
  const [errorFor, setErrorFor] = React.useState<string>();
  const requested = React.useRef(false);
  const { permissions, connections, proposalSuppressions } = store;
  const shortlist = React.useMemo(() => active ? shortlistInsights(index, { permissions, connections, proposalSuppressions }, centerId) : undefined,
    [active, centerId, connections, index, permissions, proposalSuppressions]);
  const matched = useModel && analysis?.shortlist === shortlist && analysis?.retry === retry ? analysis.result : undefined;
  const suggestions = React.useMemo(() => shortlist ? rankInsights(shortlist, matched?.scores) : noSuggestions, [matched, shortlist]);
  React.useEffect(() => {
    if (!useModel || !shortlist?.ranked.length) return;
    let current = true;
    void compareSemantics(shortlist.from.text, shortlist.ranked.map(({ to }) => to.text)).then((result) => {
      if (current) setAnalysis({ shortlist, retry, result });
    });
    return () => { current = false; };
  }, [retry, shortlist, useModel]);
  async function prepare() {
    if (!shortlist || requested.current) return;
    requested.current = true; setPreparing(true); setErrorFor(undefined);
    try {
      if (await prepareSemanticModel(shortlist.from.text)) refresh();
      else setErrorFor(centerId);
    } finally {
      requested.current = false; setPreparing(false);
    }
  }
  return { suggestions, useModel, setUseModel, mode: matched?.status, loading: Boolean(useModel && shortlist?.ranked.length && !matched),
    excluded: active && !shortlist, prepare, preparing, prepareError: errorFor === centerId };
}

export type ReturnTypeOfInsights = ReturnType<typeof useStudioSuggestions>;
