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

export function AppTabBar({ activeTab, onChangeTab }: AppTabBarProps) {
  const insets = useSafeAreaInsets();
  const tabBarStyle = [styles.tabBar, { paddingBottom: Math.max(insets.bottom, 10) }];

  return (
    <View style={tabBarStyle}>
      {(Object.keys(tabLabels) as MainTab[]).map((tabId) => {
        const selected = activeTab === tabId;
        return (
          <AnimatedPressable
            key={tabId}
            onPress={() => onChangeTab(tabId)}
            style={[styles.tabButton, selected && styles.tabButtonSelected]}
            pressedStyle={styles.tabButtonPressed}
            haptic="light"
            accessibilityRole="tab"
            accessibilityLabel={`${tabLabels[tabId]} ${tabLabelSuffix}`}
            accessibilityState={{ selected }}
          >
            <Ionicons name={tabIcons[tabId]} size={22} color={selected ? theme.colors.primary : '#758392'} />
            <Text style={[styles.tabLabel, selected && styles.tabLabelSelected]}>{tabLabels[tabId]}</Text>
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
  tabButton: {
    flex: 1,
    minHeight: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderRadius: theme.radius.md,
  },
  tabButtonSelected: {
    backgroundColor: theme.colors.primarySoft,
  },
  tabButtonPressed: {
    backgroundColor: '#e7efe9',
  },
  tabLabel: {
    color: '#758392',
    fontSize: 12,
  },
  tabLabelSelected: {
    color: theme.colors.primary,
    fontWeight: '600',
  },
});
