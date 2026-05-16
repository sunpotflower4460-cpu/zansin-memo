import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pressedOpacity, theme } from '../styles/theme';
import { triggerLightFeedback } from '../utils/feedback';
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
  const tabBarStyle = [styles.tabBar, { paddingBottom: Math.max(insets.bottom, 8) }];

  return (
    <View style={tabBarStyle}>
      {(Object.keys(tabLabels) as MainTab[]).map((tabId) => {
        const selected = activeTab === tabId;
        return (
          <Pressable
            key={tabId}
            onPress={() => {
              triggerLightFeedback();
              onChangeTab(tabId);
            }}
            style={({ pressed }) => [styles.tabButton, pressedOpacity({ pressed })]}
            accessibilityRole="button"
            accessibilityLabel={`${tabLabels[tabId]} ${tabLabelSuffix}`}
          >
            <Ionicons name={tabIcons[tabId]} size={22} color={selected ? theme.colors.primary : '#758392'} />
            <Text style={[styles.tabLabel, selected && styles.tabLabelSelected]}>{tabLabels[tabId]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    paddingTop: 8,
    paddingHorizontal: 8,
    ...theme.shadows.card,
  },
  tabButton: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
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
