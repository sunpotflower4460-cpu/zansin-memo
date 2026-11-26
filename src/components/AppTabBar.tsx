import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedPressable } from './AnimatedPressable';
import { theme } from '../styles/theme';
import { tabLabels, tabLabelSuffix } from '../utils/displayLabels';

type MainTab = 'home' | 'write' | 'seeds' | 'garden';

type AppTabBarProps = {
  activeTab: MainTab;
  onChangeTab: (tab: MainTab) => void;
};

const tabIcons: Record<MainTab, keyof typeof Ionicons.glyphMap> = {
  home: 'home-outline',
  write: 'pencil-outline',
  seeds: 'leaf-outline',
  garden: 'flower-outline',
};

// タブ本体の高さ（上余白8 + ボタン64 + 上罫線1）。トーストなど他の部品が重ならないよう共有する。
export const TAB_BAR_CONTENT_HEIGHT = 73;
export const tabBarBottomPadding = (bottomInset: number) => Math.max(bottomInset, 10);

export function AppTabBar({ activeTab, onChangeTab }: AppTabBarProps) {
  const insets = useSafeAreaInsets();
  const tabBarStyle = [styles.tabBar, { paddingBottom: tabBarBottomPadding(insets.bottom) }];

  return (
    <View style={tabBarStyle}>
      {(Object.keys(tabLabels) as MainTab[]).map((tabId) => {
        const selected = activeTab === tabId;
        return (
          <AnimatedPressable
            key={tabId}
            onPress={() => onChangeTab(tabId)}
            containerStyle={styles.tabContainer}
            style={[styles.tabButton, selected && styles.tabButtonSelected]}
            pressedStyle={styles.tabButtonPressed}
            haptic="light"
            accessibilityRole="tab"
            accessibilityLabel={`${tabLabels[tabId]}${tabLabelSuffix}`}
            accessibilityState={{ selected }}
          >
            <Ionicons name={tabIcons[tabId]} size={22} color={selected ? theme.colors.primary : theme.colors.textMuted} />
            <Text style={[styles.tabLabel, selected && styles.tabLabelSelected]} maxFontSizeMultiplier={1.3} numberOfLines={1}>{tabLabels[tabId]}</Text>
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    paddingTop: 8,
    paddingHorizontal: 8,
    ...theme.shadows.card,
  },
  tabContainer: {
    flex: 1,
  },
  tabButton: {
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderRadius: theme.radius.md,
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  tabButtonSelected: {
    backgroundColor: theme.colors.primarySoft,
  },
  tabButtonPressed: {
    backgroundColor: '#e7efe9',
  },
  tabLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  tabLabelSelected: {
    color: theme.colors.primary,
    fontWeight: '600',
  },
});
