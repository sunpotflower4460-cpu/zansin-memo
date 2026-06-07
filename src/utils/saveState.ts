import type { SeedSaveResult } from '../data/seedRepository';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export type SaveProgress = {
  requestId: number;
  state: SaveState;
};

export const beginSave = (previousRequestId: number): SaveProgress => ({
  requestId: previousRequestId + 1,
  state: 'saving',
});

export const finishSave = (current: SaveProgress, completedRequestId: number, saveResult: SeedSaveResult): SaveProgress => {
  if (completedRequestId !== current.requestId) {
    return current;
  }

  return {
    requestId: current.requestId,
    state: saveResult.ok ? 'saved' : 'error',
  };
};

export const settleSaved = (current: SaveProgress, requestId: number): SaveProgress => {
  if (current.state !== 'saved' || current.requestId !== requestId) {
    return current;
  }

  return {
    requestId: current.requestId,
    state: 'idle',
  };
};

export const getSaveStateMessage = (state: SaveState): string => {
  switch (state) {
    case 'saving':
      return '保存中…';
    case 'saved':
      return '保存しました';
    case 'error':
      return '保存に失敗しました。端末の空き容量などを確認してください。';
    default:
      return '';
  }
};
