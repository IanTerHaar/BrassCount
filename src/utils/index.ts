export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

export const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));
