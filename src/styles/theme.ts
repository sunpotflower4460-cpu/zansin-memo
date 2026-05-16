import { StyleSheet } from 'react-native';

export const theme = {
  colors: {
    background: '#f7f8f4',
    surface: '#ffffff',
    surfaceMuted: '#f0f5ef',
    text: '#1f2933',
    textMuted: '#5f6b76',
    textSoft: '#7a8794',
    primary: '#1f6b49',
    primaryPressed: '#19583c',
    primarySoft: '#e4f1e8',
    primaryDisabled: '#8fa1af',
    border: '#dbe4dd',
    chipBg: '#edf3ee',
    dangerBg: '#fff1f2',
    dangerText: '#b42318',
  },
  spacing: {
    xxs: 4,
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 24,
  },
  radius: {
    sm: 10,
    md: 14,
    lg: 18,
    full: 999,
  },
  typography: {
    largeTitle: 30,
    title: 24,
    sectionTitle: 18,
    body: 16,
    subbody: 14,
    caption: 12,
  },
  shadows: StyleSheet.create({
    card: {
      shadowColor: '#0f172a',
      shadowOpacity: 0.06,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
  }),
};

export const pressedOpacity = ({ pressed }: { pressed: boolean }) => ({
  opacity: pressed ? 0.72 : 1,
});
