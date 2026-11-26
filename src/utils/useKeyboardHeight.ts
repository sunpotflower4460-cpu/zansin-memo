import * as React from 'react';
import { Keyboard, Platform } from 'react-native';

/** 表示中のソフトキーボードの高さ（閉じていれば0）。高さは端末や入力方式で変わる。 */
export const useKeyboardHeight = (): number => {
  const [height, setHeight] = React.useState(0);
  React.useEffect(() => {
    // iOSは表示の始まりに合わせて切り替え、Androidは表示後の通知だけを使う。
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (event) =>
      setHeight(event.endCoordinates.height),
    );
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
};
