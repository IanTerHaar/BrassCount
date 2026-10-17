import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Typography } from '../src/components/Typography';
import { TabBar } from '../src/navigation/TabBar';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const routes = [
  { key: 'c', name: 'Calibration' },
  { key: 'd', name: 'Drills' },
  { key: 't', name: 'Timer' },
] as const;

const titles: Record<string, string> = {
  Calibration: 'Calibrate',
  Drills: 'Drills',
  Timer: 'Timer',
};

const render = (): ReactTestRenderer => {
  const props = {
    state: { index: 2, routes },
    descriptors: Object.fromEntries(
      routes.map(route => [
        route.key,
        { options: { title: titles[route.name] } },
      ]),
    ),
    navigation: {
      emit: jest.fn(() => ({ defaultPrevented: false })),
      navigate: jest.fn(),
    },
  } as unknown as React.ComponentProps<typeof TabBar>;

  let tree: ReactTestRenderer | undefined;
  act(() => {
    tree = create(
      <SafeAreaProvider initialMetrics={metrics}>
        <TabBar {...props} />
      </SafeAreaProvider>,
    );
  });
  if (tree === undefined) {
    throw new Error('render failed');
  }
  return tree;
};

describe('TabBar', () => {
  it('keeps every label on one line, shrinking it rather than breaking a word', () => {
    const tree = render();

    const labels = tree.root.findAllByType(Typography);

    expect(labels).toHaveLength(routes.length);
    for (const label of labels) {
      expect(label.props.numberOfLines).toBe(1);
      expect(label.props.adjustsFontSizeToFit).toBe(true);
    }
  });

  it('caps how far the system font size can grow a label', () => {
    const tree = render();

    for (const label of tree.root.findAllByType(Typography)) {
      expect(label.props.maxFontSizeMultiplier).toBeLessThanOrEqual(1.3);
    }
  });

  it('marks only the current tab as selected', () => {
    const tree = render();
    const tab = (name: string) =>
      tree.root.findAllByProps({ testID: `tab-${name}` })[0];

    expect(tab('Timer').props.accessibilityState).toEqual({ selected: true });
    expect(tab('Drills').props.accessibilityState).toEqual({ selected: false });
  });
});
