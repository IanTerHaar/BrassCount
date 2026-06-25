import type { NavigatorScreenParams } from '@react-navigation/native';

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<MainTabParamList>;
  Details: { id: string };
};

export type MainTabParamList = {
  Home: undefined;
  Settings: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
