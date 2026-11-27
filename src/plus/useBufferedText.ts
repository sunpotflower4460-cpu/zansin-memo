import * as React from 'react';
import { AppState } from 'react-native';
import { createId } from '../utils/ids';

type SaveText = (text: string, expected: number, operationId: string) => Promise<{ revision: number } | { error: string }>;

/** One draft buffer per mounted editor. A failed or uncertain write keeps the text and operation ID. */
export function useBufferedText(storedText: string, storedRevision: number, save: SaveText) {
  const [text, setText] = React.useState(storedText);
  const [message, setMessage] = React.useState('');
  const state = React.useRef({ input: storedText, persisted: storedText, revision: storedRevision });
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined);
  const active = React.useRef<Promise<boolean>>(undefined);
  const operation = React.useRef<{ input: string; revision: number; id: string }>(undefined);
  const saveRef = React.useRef(save);
  saveRef.current = save;

  React.useEffect(() => {
    const current = state.current;
    if (!active.current && current.input === current.persisted && storedRevision >= current.revision) {
      state.current = { input: storedText, persisted: storedText, revision: storedRevision };
      setText(storedText);
    }
  }, [storedText, storedRevision]);

  const flush = React.useCallback(async function flush(): Promise<boolean> {
    if (timer.current !== undefined) { clearTimeout(timer.current); timer.current = undefined; }
    if (active.current) {
      const ok = await active.current;
      return ok && flush();
    }
    const { input, persisted, revision } = state.current;
    const retry = operation.current;
    if (input === persisted && !retry) return true;
    // Settle an ambiguous older write before sending newer input from the same buffer.
    const attempt = retry ?? { input, revision, id: createId() };
    operation.current = attempt;
    const job = saveRef.current(attempt.input, attempt.revision, attempt.id).then((result) => {
      if ('error' in result) { setMessage(result.error); return false; }
      state.current.persisted = attempt.input;
      state.current.revision = result.revision;
      operation.current = undefined;
      setMessage('');
      return true;
    }).finally(() => { active.current = undefined; });
    active.current = job;
    const ok = await job;
    return ok && (state.current.input === state.current.persisted || flush());
  }, []);

  const edit = (value: string) => {
    state.current.input = value;
    setText(value);
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = undefined; void flush(); }, 500);
  };

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => { if (status !== 'active') void flush(); });
    return () => { subscription.remove(); if (timer.current !== undefined) clearTimeout(timer.current); };
  }, [flush]);

  return { text, edit, flush, message };
}
