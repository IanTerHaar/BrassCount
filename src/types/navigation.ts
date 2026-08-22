import type { NavigatorScreenParams } from '@react-navigation/native';

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<MainTabParamList>;
  Details: { id: string };
  /** Omit `id` to build a new sequence. */
  SequenceEditor: { id?: string };
};

export type MainTabParamList = {
  Calibration: undefined;
  Drills: undefined;
  Timer: undefined;
  History: NavigatorScreenParams<HistoryStackParamList>;
  Profile: undefined;
};

/**
 * Nested stack inside the History tab so a drilled-in run list keeps the
 * bottom tab bar visible (a stack screen on the root stack would cover it).
 */
export type HistoryStackParamList = {
  HistoryList: undefined;
  /** Runs recorded for a single drill. */
  HistoryDetail: { drillId: string; drillName: string };
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
