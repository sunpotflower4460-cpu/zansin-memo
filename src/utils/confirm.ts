import { Alert, type AlertButton } from 'react-native';

/** 実行前の確認ダイアログ。Web版では confirm.web.ts が使われる。 */
export const showConfirm = (title: string, message: string, buttons: AlertButton[]): void => {
  Alert.alert(title, message, buttons);
};
