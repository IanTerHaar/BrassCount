import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import {
  useDrillEditor,
  type UseDrillEditorResult,
} from '../src/hooks/useDrillEditor';
import {
  DrillStorageError,
  DrillStorageService,
  deleteDrillById,
  loadDrillById,
  loadDrills,
  saveDrill,
} from '../src/services/drillStorage';
import type { Drill, DrillInput } from '../src/types/drill';

/**
 * Saving a draft: what `save` stores, what it resolves to, and how the
 * hook reports a save in flight or one that failed. Building the draft
 * and loading a stored drill are covered through the editor screen.
 */

const BILL_DRILL: DrillInput = {
  name: 'Bill Drill',
  steps: [
    { type: 'draw', par: 1.5 },
    { type: 'shot', par: 0.25 },
    { type: 'shot', par: 0.2 },
  ],
};

/** Renders nothing; hands the hook's current value to the test. */
const Probe = ({
  drillId,
  onValue,
}: {
  drillId?: string;
  onValue: (value: UseDrillEditorResult) => void;
}) => {
  onValue(useDrillEditor(drillId));
  return null;
};

/** Let pending storage calls and the state updates they cause land. */
const settle = async (): Promise<void> => {
  await act(async () => {
    await new Promise<void>(resolve => {
      setImmediate(resolve);
    });
  });
};

type Harness = {
  current: () => UseDrillEditorResult;
  /** Call `save` and wait for everything it sets off. */
  save: () => Promise<Drill | null>;
  /** Call `save` and hand back its promise while the write is in flight. */
  startSave: () => Promise<Drill | null>;
  unmount: () => void;
};

const mounted: ReactTestRenderer[] = [];

/** Mount the hook on `drillId`, or on a new drill, and wait for it. */
const renderEditor = async (drillId?: string): Promise<Harness> => {
  let latest: UseDrillEditorResult | undefined;
  let tree: ReactTestRenderer | undefined;
  act(() => {
    tree = create(
      <Probe
        drillId={drillId}
        onValue={value => {
          latest = value;
        }}
      />,
    );
  });
  if (tree === undefined) {
    throw new Error('render failed');
  }
  const rendered = tree;
  mounted.push(rendered);
  await settle();

  const current = (): UseDrillEditorResult => {
    if (latest === undefined) {
      throw new Error('probe has not rendered');
    }
    return latest;
  };

  return {
    current,
    save: async () => {
      let saved: Drill | null = null;
      await act(async () => {
        saved = await current().save();
      });
      return saved;
    },
    startSave: () => {
      let pending: Promise<Drill | null> = Promise.resolve(null);
      act(() => {
        pending = current().save();
      });
      return pending;
    },
    unmount: () => {
      act(() => {
        rendered.unmount();
      });
    },
  };
};

/** Name a new draft and give it a draw and a shot. */
const buildDraft = (editor: Harness, name = 'Bill Drill'): void => {
  act(() => {
    editor.current().setName(name);
  });
  act(() => {
    editor.current().addStep();
  });
  act(() => {
    editor.current().addStep();
  });
};

/** A write that stays in flight until the test settles it. */
const deferredWrite = () => {
  let resolve: (drill: Drill) => void = () => {};
  let reject: (err: unknown) => void = () => {};
  const promise = new Promise<Drill>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('useDrillEditor saving', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  afterEach(() => {
    act(() => {
      mounted.splice(0).forEach(tree => tree.unmount());
    });
    jest.restoreAllMocks();
  });

  describe('a draft that is not ready', () => {
    it('cannot be saved until it has a name and a step', async () => {
      const editor = await renderEditor();
      expect(editor.current().canSave).toBe(false);
      expect(editor.current().problems).toEqual(['name-missing', 'no-steps']);

      act(() => {
        editor.current().setName('Bill Drill');
      });
      expect(editor.current().canSave).toBe(false);
      expect(editor.current().problems).toEqual(['no-steps']);

      act(() => {
        editor.current().addStep();
      });
      expect(editor.current().canSave).toBe(true);
      expect(editor.current().problems).toEqual([]);
    });

    it('stores nothing when saved anyway', async () => {
      const write = jest.spyOn(DrillStorageService, 'save');
      const editor = await renderEditor();
      act(() => {
        editor.current().setName('No steps');
      });

      const saved = await editor.save();

      expect(saved).toBeNull();
      expect(write).not.toHaveBeenCalled();
      expect(editor.current().saveState).toBe('idle');
      expect(editor.current().saveFailure).toBeNull();
    });

    it('cannot be saved while the drill it was opened on is loading', async () => {
      const drill = await saveDrill(BILL_DRILL);
      jest
        .spyOn(DrillStorageService, 'loadById')
        .mockImplementationOnce(() => new Promise<Drill | null>(() => {}));
      const update = jest.spyOn(DrillStorageService, 'update');
      const editor = await renderEditor(drill.id);

      const saved = await editor.save();

      expect(editor.current().canSave).toBe(false);
      expect(saved).toBeNull();
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('a new drill', () => {
    it('is stored and handed back with its totals worked out', async () => {
      const editor = await renderEditor();
      buildDraft(editor);
      act(() => {
        editor.current().setStepPar(editor.current().steps[0].id, 1.5);
      });
      act(() => {
        editor.current().setStepPar(editor.current().steps[1].id, 0.25);
      });

      const saved = await editor.save();

      expect(saved).toMatchObject({
        name: 'Bill Drill',
        steps: [
          { type: 'draw', par: 1.5 },
          { type: 'shot', par: 0.25 },
        ],
        totalPar: 1.75,
        shotCount: 1,
      });
      expect(await loadDrills()).toEqual([saved]);
    });

    it('has no total par when a step is untimed', async () => {
      const editor = await renderEditor();
      buildDraft(editor);
      act(() => {
        editor.current().setStepPar(editor.current().steps[0].id, 1.5);
      });

      const saved = await editor.save();

      expect(saved?.totalPar).toBeNull();
      expect(saved?.shotCount).toBe(1);
    });

    it('is stored under its name without the spaces around it', async () => {
      const editor = await renderEditor();
      buildDraft(editor, '  Bill Drill  ');

      const saved = await editor.save();

      expect(saved?.name).toBe('Bill Drill');
    });

    it('keeps the ids its steps had in the draft', async () => {
      const editor = await renderEditor();
      buildDraft(editor);
      const draftIds = editor.current().steps.map(step => step.id);

      const saved = await editor.save();

      expect(saved?.steps.map(step => step.id)).toEqual(draftIds);
    });
  });

  describe('a drill opened from storage', () => {
    it('is changed in place, keeping its id and when it was created', async () => {
      const drill = await saveDrill(BILL_DRILL);
      const editor = await renderEditor(drill.id);
      act(() => {
        editor.current().setName('Bill Drill, short');
      });
      act(() => {
        editor.current().removeStep(drill.steps[2].id);
      });

      const saved = await editor.save();

      expect(saved).toMatchObject({
        id: drill.id,
        name: 'Bill Drill, short',
        createdAt: drill.createdAt,
        totalPar: 1.75,
        shotCount: 1,
      });
      expect(await loadDrills()).toEqual([saved]);
    });

    it('stores the steps in the order they were moved to, each as it was', async () => {
      const drill = await saveDrill(BILL_DRILL);
      const editor = await renderEditor(drill.id);
      act(() => {
        editor.current().moveStep(drill.steps[0].id, 2);
      });

      const saved = await editor.save();

      expect(saved?.steps).toEqual([
        drill.steps[1],
        drill.steps[2],
        drill.steps[0],
      ]);
      expect(await loadDrillById(drill.id)).toEqual(saved);
    });

    it('keeps the id of every step that was kept', async () => {
      const drill = await saveDrill(BILL_DRILL);
      const editor = await renderEditor(drill.id);
      act(() => {
        editor.current().removeStep(drill.steps[1].id);
      });
      act(() => {
        editor.current().addStep();
      });

      const saved = await editor.save();

      expect(saved?.steps.map(step => step.id)).toEqual([
        drill.steps[0].id,
        drill.steps[2].id,
        editor.current().steps[2].id,
      ]);
    });

    it('says the drill is gone when it was deleted in the meantime', async () => {
      const drill = await saveDrill(BILL_DRILL);
      const editor = await renderEditor(drill.id);
      await deleteDrillById(drill.id);

      const saved = await editor.save();

      expect(saved).toBeNull();
      expect(editor.current().saveFailure).toBe('missing');
      expect(await loadDrillById(drill.id)).toBeNull();
    });
  });

  describe('while the write is in flight', () => {
    it('is saving, and cannot be saved again', async () => {
      const write = deferredWrite();
      jest
        .spyOn(DrillStorageService, 'save')
        .mockImplementationOnce(() => write.promise);
      const editor = await renderEditor();
      buildDraft(editor);

      act(() => {
        editor
          .current()
          .save()
          .catch(() => {});
      });

      expect(editor.current().saveState).toBe('saving');
      expect(editor.current().canSave).toBe(false);
    });

    it('ignores a second save', async () => {
      const write = deferredWrite();
      const save = jest
        .spyOn(DrillStorageService, 'save')
        .mockImplementationOnce(() => write.promise);
      const editor = await renderEditor();
      buildDraft(editor);
      const { save: saveDraft } = editor.current();

      // Both from the same render, as two taps before a redraw would be.
      let second: Drill | null | undefined;
      await act(async () => {
        saveDraft().catch(() => {});
        second = await saveDraft();
      });

      expect(second).toBeNull();
      expect(save).toHaveBeenCalledTimes(1);
    });
  });

  describe('an edit made after save was pressed', () => {
    /** Try every change the editor offers on the draft as it stands. */
    const editEverything = (editor: Harness): void => {
      const [first] = editor.current().steps;
      act(() => {
        editor.current().setName('Changed');
        editor.current().addStep();
        editor.current().changeStepType(first.id, 'holster');
        editor.current().setStepPar(first.id, 3);
        editor.current().moveStep(first.id, 1);
        editor.current().removeStep(first.id);
      });
    };

    it('is refused while the write is in flight, so what is stored is what was shown', async () => {
      const write = deferredWrite();
      jest
        .spyOn(DrillStorageService, 'save')
        .mockImplementationOnce(() => write.promise);
      const editor = await renderEditor();
      buildDraft(editor);
      const shown = editor.current().steps;
      const pending = editor.startSave();

      editEverything(editor);

      expect(editor.current().name).toBe('Bill Drill');
      expect(editor.current().steps).toEqual(shown);
      await act(async () => {
        write.reject(new Error('boom'));
        await pending;
      });
    });

    it('is refused once the drill is saved', async () => {
      const editor = await renderEditor();
      buildDraft(editor);
      const saved = await editor.save();

      editEverything(editor);

      expect(editor.current().name).toBe('Bill Drill');
      expect(editor.current().steps).toEqual(saved?.steps);
    });

    it('is taken again after a save that failed', async () => {
      jest
        .spyOn(DrillStorageService, 'save')
        .mockRejectedValueOnce(
          new DrillStorageError('Failed to save drill', 'STORAGE_FAILURE'),
        );
      const editor = await renderEditor();
      buildDraft(editor);
      await editor.save();

      act(() => {
        editor.current().setName('Second try');
        editor.current().addStep();
      });

      expect(editor.current().name).toBe('Second try');
      expect(editor.current().steps).toHaveLength(3);
    });
  });

  describe('once the write has landed', () => {
    it('is saved for good, so a new drill cannot be stored twice', async () => {
      const write = jest.spyOn(DrillStorageService, 'save');
      const editor = await renderEditor();
      buildDraft(editor);

      await editor.save();
      const again = await editor.save();

      expect(editor.current().saveState).toBe('saved');
      expect(editor.current().canSave).toBe(false);
      expect(again).toBeNull();
      expect(write).toHaveBeenCalledTimes(1);
      expect(await loadDrills()).toHaveLength(1);
    });

    it('resolves to null when the editor was closed first', async () => {
      const stored = await saveDrill(BILL_DRILL);
      const write = deferredWrite();
      jest
        .spyOn(DrillStorageService, 'save')
        .mockImplementationOnce(() => write.promise);
      const editor = await renderEditor();
      buildDraft(editor);
      const pending = editor.startSave();

      editor.unmount();
      write.resolve(stored);

      await expect(pending).resolves.toBeNull();
    });
  });

  describe('when the write fails', () => {
    it.each([
      [
        'storage failed',
        new DrillStorageError('Failed to save drill', 'STORAGE_FAILURE'),
        'failed',
      ],
      [
        'the service turned the drill down',
        new DrillStorageError('A drill needs a name', 'INVALID_INPUT'),
        'invalid',
      ],
      ['something unexpected was thrown', new Error('boom'), 'failed'],
    ] as const)('says %s', async (_case, error, failure) => {
      jest.spyOn(DrillStorageService, 'save').mockRejectedValueOnce(error);
      const editor = await renderEditor();
      buildDraft(editor);

      const saved = await editor.save();

      expect(saved).toBeNull();
      expect(editor.current().saveFailure).toBe(failure);
    });

    it('keeps the draft and can be saved again', async () => {
      jest
        .spyOn(DrillStorageService, 'save')
        .mockRejectedValueOnce(
          new DrillStorageError('Failed to save drill', 'STORAGE_FAILURE'),
        );
      const editor = await renderEditor();
      buildDraft(editor);
      await editor.save();

      expect(editor.current().saveState).toBe('idle');
      expect(editor.current().canSave).toBe(true);
      expect(editor.current().name).toBe('Bill Drill');
      expect(editor.current().steps).toHaveLength(2);

      const saved = await editor.save();

      expect(saved?.name).toBe('Bill Drill');
      expect(editor.current().saveFailure).toBeNull();
      expect(await loadDrills()).toEqual([saved]);
    });

    it('drops the failure as soon as another save starts', async () => {
      const write = deferredWrite();
      jest
        .spyOn(DrillStorageService, 'save')
        .mockRejectedValueOnce(
          new DrillStorageError('Failed to save drill', 'STORAGE_FAILURE'),
        )
        .mockImplementationOnce(() => write.promise);
      const editor = await renderEditor();
      buildDraft(editor);
      await editor.save();
      expect(editor.current().saveFailure).toBe('failed');

      act(() => {
        editor
          .current()
          .save()
          .catch(() => {});
      });

      expect(editor.current().saveFailure).toBeNull();
    });

    it('drops the failure once the draft is edited', async () => {
      jest
        .spyOn(DrillStorageService, 'save')
        .mockRejectedValueOnce(
          new DrillStorageError('Failed to save drill', 'STORAGE_FAILURE'),
        );
      const editor = await renderEditor();
      buildDraft(editor);
      await editor.save();
      expect(editor.current().saveFailure).toBe('failed');

      act(() => {
        editor.current().setName('Bill Drill 2');
      });

      expect(editor.current().saveFailure).toBeNull();
    });

    it('keeps the drill-is-gone failure through edits and cannot save again', async () => {
      const drill = await saveDrill(BILL_DRILL);
      const editor = await renderEditor(drill.id);
      await deleteDrillById(drill.id);
      await editor.save();
      expect(editor.current().saveFailure).toBe('missing');

      act(() => {
        editor.current().setName('Renamed');
      });

      expect(editor.current().saveFailure).toBe('missing');
      expect(editor.current().canSave).toBe(false);
      expect(await editor.save()).toBeNull();
    });

    it('does not report a failure once the editor is closed', async () => {
      const write = deferredWrite();
      jest
        .spyOn(DrillStorageService, 'save')
        .mockImplementationOnce(() => write.promise);
      const editor = await renderEditor();
      buildDraft(editor);
      const pending = editor.startSave();

      editor.unmount();
      write.reject(new Error('boom'));

      await expect(pending).resolves.toBeNull();
    });
  });
});
