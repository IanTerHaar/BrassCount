require('react-native-gesture-handler/jestSetup');

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest'),
);

jest.mock('react-native-audio-api', () =>
  require('react-native-audio-api/mock'),
);
