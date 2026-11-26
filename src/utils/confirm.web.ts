import type { AlertButton } from 'react-native';

/**
 * Web版の確認ダイアログ。react-native-web の Alert.alert は何もしないため、ブラウザ標準の confirm を使う。
 * 「キャンセル（style: 'cancel'）」と「実行」の2択に対応する。ボタンの文言はブラウザ標準になる。
 */
export const showConfirm = (title: string, message: string, buttons: AlertButton[]): void => {
  const accepted = window.confirm(`${title}\n\n${message}`);
  const chosen = buttons.find((button) => (accepted ? button.style !== 'cancel' : button.style === 'cancel'));
  chosen?.onPress?.();
};
