import type { NavigatorScreenParams } from '@react-navigation/native';

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<MainTabParamList>;
  Details: { id: string };
  /** Omit `id` to build a new sequence. */
  SequenceEditor: { id?: string };
  /** Runs recorded for a single drill. */
  HistoryDetail: { drillName: string };
};

export type MainTabParamList = {
  Calibration: undefined;
  Drills: undefined;
  Timer: undefined;
  History: undefined;
  Profile: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
