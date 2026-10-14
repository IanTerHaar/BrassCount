import type { ComponentProps } from 'react';

import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { SaveRunPrompt } from '../src/components/SaveRunPrompt';

type Props = ComponentProps<typeof SaveRunPrompt>;

const defaults: Props = {
  completed: true,
  totalTime: 2.2,
  heardCount: 3,
  plannedCount: 3,
  status: 'unsaved',
  failure: null,
  onSave: () => {},
  onDiscard: () => {},
};

const render = (props: Partial<Props> = {}): ReactTestRenderer => {
  let tree: ReactTestRenderer | undefined;
  act(() => {
    tree = create(<SaveRunPrompt {...defaults} {...props} />);
  });
  if (tree === undefined) {
    throw new Error('render failed');
  }
  return tree;
};

const first = (tree: ReactTestRenderer, testID: string) =>
  tree.root.findAllByProps({ testID })[0];

const has = (tree: ReactTestRenderer, testID: string): boolean =>
  tree.root.findAllByProps({ testID }).length > 0;

describe('SaveRunPrompt', () => {
  it('asks to save a completed run, with its time', () => {
    const tree = render();

    expect(first(tree, 'text-save-run-summary').props.children).toBe(
      '2.20s · 3 steps heard.',
    );
    expect(first(tree, 'btn-save-run').props.label).toBe('Save run');
    expect(has(tree, 'text-save-run-error')).toBe(false);
  });

  it('says a run stopped early is kept as incomplete', () => {
    const tree = render({ completed: false, totalTime: 1.4, heardCount: 1 });

    expect(first(tree, 'text-save-run-summary').props.children).toBe(
      'Stopped early at 1.40s: 1 of 3 steps heard. It is kept as incomplete and left out of your best and average.',
    );
    expect(first(tree, 'btn-save-run').props.label).toBe('Save as incomplete');
  });

  it('calls back on Save and on Discard', () => {
    const onSave = jest.fn();
    const onDiscard = jest.fn();
    const tree = render({ onSave, onDiscard });

    act(() => first(tree, 'btn-save-run').props.onPress());
    act(() => first(tree, 'btn-discard-run').props.onPress());

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it('turns both buttons off while saving', () => {
    const tree = render({ status: 'saving' });

    expect(first(tree, 'btn-save-run').props).toMatchObject({
      label: 'Saving…',
      disabled: true,
    });
    expect(first(tree, 'btn-discard-run').props.disabled).toBe(true);
  });

  it('offers a retry when the device storage failed', () => {
    const tree = render({ failure: 'failed' });

    expect(first(tree, 'text-save-run-error').props.children).toBe(
      'Could not save this run. Try again.',
    );
    expect(first(tree, 'btn-save-run').props.disabled).toBe(false);
  });

  it('offers no retry for a run storage turned down, but can still discard it', () => {
    const tree = render({ failure: 'invalid' });

    expect(first(tree, 'text-save-run-error').props.children).toBe(
      'This run cannot be saved.',
    );
    expect(first(tree, 'btn-save-run').props.disabled).toBe(true);
    expect(first(tree, 'btn-discard-run').props.disabled).toBe(false);
  });

  it('stacks its buttons at a large text size', () => {
    // Jest's window has a font scale of 2.
    const tree = render();

    const row = first(tree, 'btn-discard-run').parent?.parent;
    expect(row?.props.style).toMatchObject({ flexDirection: 'column' });
  });

  it('says the run is saved in place of the question', () => {
    const tree = render({ status: 'saved' });

    expect(has(tree, 'text-run-saved')).toBe(true);
    expect(has(tree, 'btn-save-run')).toBe(false);
    expect(has(tree, 'btn-discard-run')).toBe(false);
  });
});
