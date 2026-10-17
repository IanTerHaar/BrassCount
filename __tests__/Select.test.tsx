import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Select } from '../src/components/Select';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const options = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Bravo' },
] as const;

const render = (onChange: (next: string) => void): ReactTestRenderer => {
  let tree: ReactTestRenderer | undefined;
  act(() => {
    tree = create(
      <SafeAreaProvider initialMetrics={metrics}>
        <Select
          value="a"
          options={[...options]}
          onChange={onChange}
          testID="pick"
        />
      </SafeAreaProvider>,
    );
  });
  if (tree === undefined) {
    throw new Error('render failed');
  }
  return tree;
};

/** The pressable a `testID` lands on; the same id also sits on parent elements. */
const first = (tree: ReactTestRenderer, testID: string) =>
  tree.root.findAll(
    node => node.props.testID === testID && node.props.onPress !== undefined,
  )[0];

/** Any node carrying the id, for checking what the sheet announces. */
const announced = (tree: ReactTestRenderer, testID: string) =>
  tree.root.findAll(
    node =>
      node.props.testID === testID &&
      node.props.accessibilityRole !== undefined,
  )[0];

describe('Select', () => {
  it('closes from its backdrop, which is announced as a Close button', () => {
    const tree = render(jest.fn());
    act(() => first(tree, 'pick').props.onPress());

    expect(announced(tree, 'pick-backdrop').props).toMatchObject({
      accessibilityRole: 'button',
      accessibilityLabel: 'Close',
    });

    act(() => first(tree, 'pick-backdrop').props.onPress());

    expect(
      tree.root.findAll(node => node.props.testID === 'pick-option-b'),
    ).toHaveLength(0);
  });

  it('reports the chosen option and closes', () => {
    const onChange = jest.fn();
    const tree = render(onChange);
    act(() => first(tree, 'pick').props.onPress());

    act(() => first(tree, 'pick-option-b').props.onPress());

    expect(onChange).toHaveBeenCalledWith('b');
    expect(
      tree.root.findAll(node => node.props.testID === 'pick-option-b'),
    ).toHaveLength(0);
  });
});
