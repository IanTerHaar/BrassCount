import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ListRow } from '../src/components/ListRow';
import { Typography } from '../src/components/Typography';

const render = (row: React.ReactElement): ReactTestRenderer => {
  let tree: ReactTestRenderer | undefined;
  act(() => {
    tree = create(row);
  });
  if (tree === undefined) {
    throw new Error('render failed');
  }
  return tree;
};

/** The native view (or touchable) the row's `testID` lands on. */
const host = (tree: ReactTestRenderer, testID: string) =>
  tree.root.findAll(
    node => typeof node.type === 'string' && node.props.testID === testID,
  )[0];

/** The colour role the row gives the text it shows as its value. */
const valueColor = (tree: ReactTestRenderer, value: string): unknown =>
  tree.root
    .findAllByType(Typography)
    .find(text => text.props.children === value)?.props.color;

describe('ListRow', () => {
  it('reads a row that is not pressable as one item when it is given a spoken label', () => {
    const tree = render(
      <ListRow
        title="Shot 1"
        subtitle="par 1.75s · 0.35s under"
        value="1.40s"
        accessibilityLabel="Shot 1, par 1.75 seconds, took 1.4 seconds"
        testID="row"
      />,
    );

    expect(host(tree, 'row').props).toMatchObject({
      accessible: true,
      accessibilityLabel: 'Shot 1, par 1.75 seconds, took 1.4 seconds',
    });
  });

  it('leaves a row with no spoken label to be read piece by piece', () => {
    const tree = render(<ListRow title="Draw" value="—" testID="row" />);

    expect(host(tree, 'row').props.accessible).toBe(false);
    expect(host(tree, 'row').props.accessibilityLabel).toBeUndefined();
  });

  it('puts the spoken label of a pressable row on its button', () => {
    const tree = render(
      <ListRow
        title="Bill Drill"
        subtitle="3 runs · Best 4.21s · 2d ago"
        accessibilityLabel="Bill Drill, 3 runs"
        onPress={() => {}}
        testID="row"
      />,
    );

    expect(host(tree, 'row').props).toMatchObject({
      accessibilityRole: 'button',
      accessibilityLabel: 'Bill Drill, 3 runs',
    });
  });

  it('shows its value in the colour it is given', () => {
    const tree = render(
      <ListRow title="Shot 2" value="0.30s" valueColor="danger" />,
    );

    expect(valueColor(tree, '0.30s')).toBe('danger');
  });

  it('shows its value in the secondary text colour by default', () => {
    const tree = render(<ListRow title="Shot 2" value="0.30s" />);

    expect(valueColor(tree, '0.30s')).toBe('textSecondary');
  });
});
