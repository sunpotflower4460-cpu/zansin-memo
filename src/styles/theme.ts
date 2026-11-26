import { Platform, StyleSheet } from 'react-native';

// 和紙（生成り）をベースにした配色。墨色の文字、若草色のアクセント、ごく小さな朱を差し色にする。
export const theme = {
  colors: {
    background: '#f5efe2', // 生成り
    surface: '#fbf8f0', // 和紙白
    surfaceElevated: '#fdfbf5',
    surfaceMuted: '#efe8d8',
    surfaceSoft: '#f3ecdd',
    surfacePressed: '#ebe3d0',
    inputBg: '#fdfbf6',
    inputBgSoft: '#f6f0e3',
    text: '#2b2a26', // 墨
    textMuted: '#5d5850',
    textSoft: '#686254',
    placeholder: '#766f62',
    primary: '#1f6b49', // 深緑
    primaryPressed: '#19583c',
    primarySoft: '#e1ebd8',
    primaryDisabled: '#8f9a8a',
    leaf: '#dfe9d6', // 若草の淡色（ボタン・選択状態）
    leafPressed: '#d2e0c7',
    border: '#e0d6c0',
    rule: '#e2d9c4', // 区切り線
    chipBg: '#f1eadb',
    chipPressed: '#e8dfc9',
    chipSelectedBorder: '#8fb59a',
    accent: '#b8453a', // 朱
    dangerBg: '#fbebe6',
    dangerPressed: '#f6dbd3',
    dangerBorder: '#e8b8ae',
    dangerText: '#a8322a',
    warning: '#d97706',
    shadow: '#4a3b1f',
  },
  spacing: {
    xxs: 4,
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 24,
    xxl: 32,
    xxxl: 40,
  },
  radius: {
    sm: 10,
    md: 14,
    lg: 18,
    xl: 24,
    full: 999,
  },
  typography: {
    largeTitle: 32,
    title: 26,
    sectionTitle: 18,
    body: 16,
    subbody: 14,
    caption: 12,
  },
  fonts: {
    // 見出しと種の本文は明朝体。端末に入っている書体だけを使い、追加のフォントは同梱しない。
    serif: Platform.select({
      ios: 'Hiragino Mincho ProN',
      android: 'serif',
      default: '"Hiragino Mincho ProN", "Noto Serif CJK JP", "Yu Mincho", "YuMincho", serif',
    }) as string,
  },
  shadows: StyleSheet.create({
    card: {
      shadowColor: '#4a3b1f',
      shadowOpacity: 0.07,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 3 },
      elevation: 2,
    },
    floating: {
      shadowColor: '#4a3b1f',
      shadowOpacity: 0.16,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 5 },
      elevation: 6,
    },
  }),
};

export const pressedOpacity = ({ pressed }: { pressed: boolean }) => ({
  opacity: pressed ? 0.72 : 1,
});
