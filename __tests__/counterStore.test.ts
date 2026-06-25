/**
 * @format
 */

import { useCounterStore } from '../src/store/counterStore';

describe('counterStore', () => {
  beforeEach(() => {
    useCounterStore.getState().reset();
  });

  it('starts at 0', () => {
    expect(useCounterStore.getState().count).toBe(0);
  });

  it('increments', () => {
    useCounterStore.getState().increment();
    useCounterStore.getState().increment();
    expect(useCounterStore.getState().count).toBe(2);
  });

  it('decrements', () => {
    useCounterStore.getState().increment();
    useCounterStore.getState().decrement();
    expect(useCounterStore.getState().count).toBe(0);
  });

  it('resets to 0', () => {
    useCounterStore.getState().increment();
    useCounterStore.getState().reset();
    expect(useCounterStore.getState().count).toBe(0);
  });
});
