import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { TimerScreen, HistoryScreen, SettingsScreen } from '@/screens';
import type { MainTabParamList } from '@/types/navigation';

const Tab = createBottomTabNavigator<MainTabParamList>();

export const MainTabs = () => (
  <Tab.Navigator>
    <Tab.Screen name="Timer" component={TimerScreen} />
    <Tab.Screen name="History" component={HistoryScreen} />
    <Tab.Screen name="Settings" component={SettingsScreen} />
  </Tab.Navigator>
);
