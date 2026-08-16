import type { MainTabParamList } from '@/types/navigation';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  GunsScreen,
  HistoryScreen,
  SequencesScreen,
  SocialScreen,
  TimerScreen,
} from '@/screens';
import { TabBar } from './TabBar';

const Tab = createBottomTabNavigator<MainTabParamList>();

/**
 * Screens render their own headers via the `Screen` shell, so the navigator
 * header stays off and the custom `TabBar` owns the bottom chrome.
 *
 * `Timer` is a real tab route so navigating to it keeps the bottom bar
 * mounted, but the `TabBar` hides it from the tab strip — the raised
 * centre button is its entry point.
 */
export const MainTabs = () => (
  <Tab.Navigator
    tabBar={props => <TabBar {...props} />}
    screenOptions={{ headerShown: false }}
  >
    <Tab.Screen
      name="Social"
      component={SocialScreen}
      options={{ title: 'Social' }}
    />
    <Tab.Screen
      name="Sequences"
      component={SequencesScreen}
      options={{ title: 'Drills' }}
    />
    <Tab.Screen
      name="Timer"
      component={TimerScreen}
      options={{ title: 'Timer' }}
    />
    <Tab.Screen
      name="History"
      component={HistoryScreen}
      options={{ title: 'History' }}
    />
    <Tab.Screen
      name="Guns"
      component={GunsScreen}
      options={{ title: 'Guns' }}
    />
  </Tab.Navigator>
);
