import assert from 'node:assert/strict';
import test from 'node:test';
import { showConfirm } from './confirm.web';

const run = (answer: boolean) => {
  const asked: string[] = [];
  const pressed: string[] = [];
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      confirm: (text: string) => {
        asked.push(text);
        return answer;
      },
    },
  });
  showConfirm('削除しますか？', 'あとで復元できます。', [
    { text: 'キャンセル', style: 'cancel', onPress: () => pressed.push('cancel') },
    { text: '削除', style: 'destructive', onPress: () => pressed.push('delete') },
  ]);
  Reflect.deleteProperty(globalThis, 'window');
  return { asked, pressed };
};

test('web confirm shows the title and message, and runs only the action when accepted', () => {
  const { asked, pressed } = run(true);
  assert.deepEqual(asked, ['削除しますか？\n\nあとで復元できます。']);
  assert.deepEqual(pressed, ['delete']);
});

test('web confirm never runs the action when dismissed', () => {
  assert.deepEqual(run(false).pressed, ['cancel']);
});
