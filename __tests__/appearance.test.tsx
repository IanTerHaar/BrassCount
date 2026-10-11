import { Text, useColorScheme } from 'react-native';

import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useAppearance } from '../src/hooks/useAppearance';
import { useTheme } from '../src/hooks/useTheme';
import {
  AppearanceProvider,
  type AppearanceContextValue,
  type AppearanceProviderProps,
} from '../src/store/AppearanceContext';
import { resolveThemeMode } from '../src/theme/theme';
import { DEFAULT_PROFILE, type Profile } from '../src/types/profile';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: jest.fn(() => 'light'),
}));

const mockedColorScheme = jest.mocked(useColorScheme);

type Storage = NonNullable<AppearanceProviderProps['storage']>;

const profileWith = (appearance: Profile['appearance']): Profile => ({
  ...DEFAULT_PROFILE,
  appearance,
});

/** A promise and the functions that settle it, for ordering saves by hand. */
const deferred = <T,>() => {
  let resolve: (value: T) => void = () => {};
  let reject: (reason: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

let appearance: AppearanceContextValue | undefined;

/** Shows the theme in use and keeps a handle on the context for the test. */
const Probe = () => {
  appearance = useAppearance();
  return <Text testID="text-theme-mode">{useTheme().mode}</Text>;
};

const mounted: ReactTestRenderer[] = [];

const render = (storage: Storage): ReactTestRenderer => {
  let tree: ReactTestRenderer | undefined;
  act(() => {
    tree = create(
      <AppearanceProvider storage={storage}>
        <Probe />
      </AppearanceProvider>,
    );
  });
  if (tree === undefined) {
    throw new Error('render failed');
  }
  mounted.push(tree);
  return tree;
};

const modeShown = (tree: ReactTestRenderer): string | null => {
  const nodes = tree.root.findAllByProps({ testID: 'text-theme-mode' });
  return nodes.length === 0 ? null : nodes[0].props.children;
};

const flush = async (): Promise<void> => {
  await act(async () => {
    await new Promise<void>(resolve => {
      setImmediate(resolve);
    });
  });
};

/**
 * Pick a preference and return its save, wrapped so awaiting this does not
 * also wait for the save to settle.
 */
const choose = async (
  preference: Profile['appearance'],
): Promise<{ saved: Promise<void> }> => {
  let saved: Promise<void> = Promise.resolve();
  await act(async () => {
    saved = appearance!.setPreference(preference);
    // A rejection is asserted by the caller; keep it from going unhandled.
    saved.catch(() => {});
  });
  return { saved };
};

describe('resolveThemeMode', () => {
  it.each([
    ['light', 'dark', 'light'],
    ['dark', 'light', 'dark'],
    ['system', 'dark', 'dark'],
    ['system', 'light', 'light'],
    ['system', null, 'light'],
    ['system', 'unspecified', 'light'],
  ] as const)(
    'resolves %s on a %s device to %s',
    (preference, scheme, expected) => {
      expect(resolveThemeMode(preference, scheme)).toBe(expected);
    },
  );
});

describe('useTheme', () => {
  afterEach(() => {
    mockedColorScheme.mockReturnValue('light');
  });

  it('follows the device when there is no AppearanceProvider', () => {
    mockedColorScheme.mockReturnValue('dark');
    const ThemeOnly = () => <Text testID="mode">{useTheme().mode}</Text>;
    let tree: ReactTestRenderer | undefined;
    act(() => {
      tree = create(<ThemeOnly />);
    });

    expect(tree!.root.findByProps({ testID: 'mode' }).props.children).toBe(
      'dark',
    );
    act(() => tree!.unmount());
  });
});

describe('AppearanceProvider', () => {
  afterEach(() => {
    act(() => {
      mounted.splice(0).forEach(tree => tree.unmount());
    });
    appearance = undefined;
    mockedColorScheme.mockReturnValue('light');
  });

  it('renders nothing until the stored preference is read', async () => {
    const read = deferred<Profile>();
    const tree = render({ load: () => read.promise, update: jest.fn() });

    expect(modeShown(tree)).toBeNull();

    await act(async () => {
      read.resolve(profileWith('dark'));
    });

    expect(modeShown(tree)).toBe('dark');
  });

  it('follows the device while the preference is system', async () => {
    mockedColorScheme.mockReturnValue('dark');
    const tree = render({
      load: async () => profileWith('system'),
      update: jest.fn(),
    });
    await flush();

    expect(modeShown(tree)).toBe('dark');
  });

  it('pins the theme regardless of the device', async () => {
    mockedColorScheme.mockReturnValue('dark');
    const tree = render({
      load: async () => profileWith('light'),
      update: jest.fn(),
    });
    await flush();

    expect(modeShown(tree)).toBe('light');
  });

  it('applies a choice before the save finishes, and stores it', async () => {
    const save = deferred<Profile>();
    const update = jest.fn(() => save.promise);
    const tree = render({ load: async () => DEFAULT_PROFILE, update });
    await flush();

    await choose('dark');

    expect(modeShown(tree)).toBe('dark');
    expect(update).toHaveBeenCalledWith({ appearance: 'dark' });

    await act(async () => {
      save.resolve(profileWith('dark'));
    });
    expect(modeShown(tree)).toBe('dark');
  });

  it('goes back to the saved choice and rejects when the save fails', async () => {
    const failure = new Error('disk full');
    const tree = render({
      load: async () => profileWith('light'),
      update: () => Promise.reject(failure),
    });
    await flush();

    const { saved } = await choose('dark');

    await expect(saved).rejects.toBe(failure);
    expect(modeShown(tree)).toBe('light');
  });

  it('keeps a later choice, without an error, when an earlier save fails', async () => {
    const first = deferred<Profile>();
    const second = deferred<Profile>();
    const update = jest
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const tree = render({ load: async () => profileWith('light'), update });
    await flush();

    const { saved: firstSaved } = await choose('dark');
    await choose('system');
    await act(async () => {
      first.reject(new Error('disk full'));
    });

    // The newer choice owns the outcome, so the stale failure is not raised.
    await expect(firstSaved).resolves.toBeUndefined();
    // Still on the later choice: a system preference on a light device.
    expect(appearance!.preference).toBe('system');
    expect(modeShown(tree)).toBe('light');

    await act(async () => {
      second.resolve(profileWith('system'));
    });
    expect(appearance!.preference).toBe('system');
  });

  it('rolls a failed latest choice back to the last one that saved', async () => {
    const first = deferred<Profile>();
    const second = deferred<Profile>();
    const update = jest
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    render({ load: async () => profileWith('light'), update });
    await flush();

    await choose('dark');
    const { saved: secondSaved } = await choose('system');
    await act(async () => {
      first.resolve(profileWith('dark'));
    });
    await act(async () => {
      second.reject(new Error('disk full'));
    });

    await expect(secondSaved).rejects.toThrow('disk full');
    expect(appearance!.preference).toBe('dark');
  });

  it('starts on the device setting when the stored choice cannot be read', async () => {
    mockedColorScheme.mockReturnValue('dark');
    const tree = render({
      load: () => Promise.reject(new Error('unreadable')),
      update: jest.fn(),
    });
    await flush();

    expect(appearance!.preference).toBe('system');
    expect(modeShown(tree)).toBe('dark');
  });

  it('throws when useAppearance is used outside the provider', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const Orphan = () => {
      useAppearance();
      return null;
    };

    expect(() => {
      act(() => {
        create(<Orphan />);
      });
    }).toThrow(/AppearanceProvider/);
  });
});
