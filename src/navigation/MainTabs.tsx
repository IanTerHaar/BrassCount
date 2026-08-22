import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import {
  CalibrationScreen,
  DrillsScreen,
  ProfileScreen,
  TimerScreen,
} from '@/screens';
import type { MainTabParamList } from '@/types/navigation';

import { HistoryStack } from './HistoryStack';
import { TabBar } from './TabBar';

const Tab = createBottomTabNavigator<MainTabParamList>();

/**
 * Screens render their own headers via the `Screen` shell, so the navigator
 * header stays off and the custom `TabBar` owns the bottom chrome.
 *
 * Tabs are declared in visual left-to-right order. `initialRouteName` keeps
 * Timer as the landing screen even though it sits in the middle of the row.
 */
export const MainTabs = () => (
  <Tab.Navigator
    initialRouteName="Timer"
    tabBar={props => <TabBar {...props} />}
    screenOptions={{ headerShown: false }}
  >
    <Tab.Screen
      name="Calibration"
      component={CalibrationScreen}
      options={{ title: 'Calibrate' }}
    />
    <Tab.Screen
      name="Drills"
      component={DrillsScreen}
      options={{ title: 'Drills' }}
    />
    <Tab.Screen
      name="Timer"
      component={TimerScreen}
      options={{ title: 'Timer' }}
    />
    <Tab.Screen
      name="History"
      component={HistoryStack}
      options={{ title: 'History' }}
    />
    <Tab.Screen
      name="Profile"
      component={ProfileScreen}
      options={{ title: 'Profile' }}
    />
  </Tab.Navigator>
);
