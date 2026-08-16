import type { NavigatorScreenParams } from '@react-navigation/native';

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<MainTabParamList>;
  Details: { id: string };
  Profile: undefined;
  /** Omit `id` to build a new sequence. */
  SequenceEditor: { id?: string };
};

export type MainTabParamList = {
  Social: undefined;
  Timer: undefined;
  Sequences: undefined;
  History: undefined;
  Guns: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
