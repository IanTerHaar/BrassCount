require('react-native-gesture-handler/jestSetup');

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest'),
);

jest.mock('react-native-audio-api', () =>
  require('react-native-audio-api/mock'),
);

// The AudioCapture TurboModule is app-local Kotlin, so there is no library
// mock to reuse. Without this, importing anything that reaches the spec
// throws in `TurboModuleRegistry.getEnforcing`.
jest.mock('./src/specs/NativeAudioCapture', () => ({
  __esModule: true,
  default: {
    start: jest.fn(() => Promise.resolve()),
    stop: jest.fn(() => Promise.resolve()),
    isCapturing: jest.fn(() => false),
    addListener: jest.fn(),
    removeListeners: jest.fn(),
  },
}));
