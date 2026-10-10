import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Avatar } from '../src/components/Avatar';
import { Icon } from '../src/components/Icon';
import { Typography } from '../src/components/Typography';

const renderAvatar = (
  name: string,
  onPress?: () => void,
): ReactTestRenderer => {
  let tree: ReactTestRenderer | undefined;
  act(() => {
    tree = create(<Avatar name={name} onPress={onPress} />);
  });
  if (tree === undefined) {
    throw new Error('render failed');
  }
  return tree;
};

/** The initials shown, or `null` when the avatar shows no text. */
const initialsOf = (tree: ReactTestRenderer): string | null => {
  const text = tree.root.findAllByType(Typography);
  return text.length === 0 ? null : text[0].props.children;
};

describe('Avatar', () => {
  it('shows the first letter of the first two words, in capitals', () => {
    expect(initialsOf(renderAvatar('marty mcfly'))).toBe('MM');
    expect(initialsOf(renderAvatar('Emmett Lathrop Brown'))).toBe('EL');
  });

  it('shows one initial for a single-word name', () => {
    expect(initialsOf(renderAvatar('  Biff  '))).toBe('B');
  });

  it('keeps an emoji whole when a name starts with one', () => {
    expect(initialsOf(renderAvatar('🎯 Marty'))).toBe('🎯M');
  });

  it('shows a person glyph instead of an empty circle for a blank name', () => {
    const tree = renderAvatar('   ');

    expect(initialsOf(tree)).toBeNull();
    expect(tree.root.findAllByType(Icon)[0].props.name).toBe('user');
  });

  it('shows no glyph once there is a name', () => {
    expect(renderAvatar('Marty').root.findAllByType(Icon)).toHaveLength(0);
  });

  it('keeps the initials out of the screen reader’s way', () => {
    const initials =
      renderAvatar('Marty McFly').root.findAllByType(Typography)[0];

    expect(initials.props.importantForAccessibility).toBe('no');
  });

  it('labels a pressable avatar with the name, or plainly without one', () => {
    const label = (name: string): string =>
      renderAvatar(name, () => {}).root.findAllByProps({
        accessibilityRole: 'button',
      })[0].props.accessibilityLabel;

    expect(label('Marty McFly')).toBe('Marty McFly, open profile');
    expect(label('  ')).toBe('Open profile');
  });
});
