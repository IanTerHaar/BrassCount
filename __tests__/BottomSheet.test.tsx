import { Text } from 'react-native';

import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { BottomSheet } from '../src/components/BottomSheet';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const render = (onClose: () => void, visible = true): ReactTestRenderer => {
  let tree: ReactTestRenderer | undefined;
  act(() => {
    tree = create(
      <SafeAreaProvider initialMetrics={metrics}>
        <BottomSheet
          visible={visible}
          onClose={onClose}
          closeLabel="Close picker"
          backdropTestID="backdrop"
        >
          <Text>Inside</Text>
        </BottomSheet>
      </SafeAreaProvider>,
    );
  });
  if (tree === undefined) {
    throw new Error('render failed');
  }
  return tree;
};

const backdrop = (tree: ReactTestRenderer) =>
  tree.root.findAllByProps({ testID: 'backdrop' })[0];

describe('BottomSheet', () => {
  it('gives the backdrop a button role and the close label', () => {
    const tree = render(jest.fn());

    expect(backdrop(tree).props).toMatchObject({
      accessibilityRole: 'button',
      accessibilityLabel: 'Close picker',
    });
  });

  it('closes when the backdrop is pressed', () => {
    const onClose = jest.fn();
    const tree = render(onClose);

    act(() => backdrop(tree).props.onPress());

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows its children', () => {
    const tree = render(jest.fn());

    expect(tree.root.findAllByType(Text)[0].props.children).toBe('Inside');
  });

  it('renders nothing while hidden', () => {
    const tree = render(jest.fn(), false);

    expect(tree.root.findAllByType(Text)).toHaveLength(0);
  });

  it('keeps the sheet itself out of the accessibility tree as a labelled element', () => {
    const tree = render(jest.fn());

    const labelled = tree.root.findAll(
      node =>
        typeof node.type === 'string' &&
        node.props.accessibilityLabel !== undefined,
    );

    expect(labelled.map(node => node.props.accessibilityLabel)).toEqual([
      'Close picker',
    ]);
  });
});
