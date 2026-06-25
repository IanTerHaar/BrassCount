import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import type { RootStackParamList } from '@/types/navigation';
import { DetailsScreen } from '@screens/DetailsScreen';

import { MainTabs } from './MainTabs';

const Stack = createNativeStackNavigator<RootStackParamList>();

export const RootNavigator = () => (
  <NavigationContainer>
    <Stack.Navigator>
      <Stack.Screen
        name="Tabs"
        component={MainTabs}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="Details" component={DetailsScreen} />
    </Stack.Navigator>
  </NavigationContainer>
);
