import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import type { MainTabParamList } from '@/types/navigation';
import { HomeScreen } from '@screens/HomeScreen';
import { SettingsScreen } from '@screens/SettingsScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();

export const MainTabs = () => (
  <Tab.Navigator>
    <Tab.Screen name="Home" component={HomeScreen} />
    <Tab.Screen name="Settings" component={SettingsScreen} />
  </Tab.Navigator>
);
