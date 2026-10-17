import { StyleSheet } from 'react-native';

import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Button } from '../src/components/Button';
import { sizes } from '../src/theme/theme';

const render = (button: React.ReactElement): ReactTestRenderer => {
  let tree: ReactTestRenderer | undefined;
  act(() => {
    tree = create(button);
  });
  if (tree === undefined) {
    throw new Error('render failed');
  }
  return tree;
};

/** The native view the button's `testID` lands on. */
const host = (tree: ReactTestRenderer) =>
  tree.root.findAll(
    node => typeof node.type === 'string' && node.props.testID === 'btn',
  )[0];

describe('Button', () => {
  it('is at least the touch-target minimum tall', () => {
    const tree = render(
      <Button label="Save" onPress={jest.fn()} testID="btn" />,
    );

    const style = StyleSheet.flatten(host(tree).props.style);

    expect(style.minHeight).toBe(sizes.touchTarget);
  });

  it('announces why it is disabled through its hint', () => {
    const tree = render(
      <Button
        label="Test"
        disabled
        accessibilityHint="Recalibrate this sound first"
        onPress={jest.fn()}
        testID="btn"
      />,
    );

    expect(host(tree).props.accessibilityHint).toBe(
      'Recalibrate this sound first',
    );
    expect(host(tree).props.accessibilityState).toMatchObject({
      disabled: true,
    });
  });

  it('is announced as busy and cannot be pressed again while busy', () => {
    const tree = render(
      <Button label="Saving…" busy onPress={jest.fn()} testID="btn" />,
    );

    expect(host(tree).props.accessibilityState).toEqual({
      disabled: true,
      busy: true,
    });
  });

  it('is neither disabled nor busy by default', () => {
    const tree = render(
      <Button label="Save" onPress={jest.fn()} testID="btn" />,
    );

    expect(host(tree).props.accessibilityState).toEqual({
      disabled: false,
      busy: false,
    });
  });
});
