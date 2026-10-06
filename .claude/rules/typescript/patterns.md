---
paths:
  - '**/*.ts'
  - '**/*.tsx'
  - '**/*.js'
  - '**/*.jsx'
---

# TypeScript/JavaScript Patterns

> This file extends [common/patterns.md](../common/patterns.md) with TypeScript/JavaScript specific content.

## Service Module

Functions, a named error, and an object-form handle:

```typescript
export class DrillStorageError extends Error {
  cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'DrillStorageError';
    this.cause = cause;
  }
}

export async function saveDrill(input: DrillInput): Promise<Drill> {
  // …
}

export async function loadDrills(): Promise<Drill[]> {
  // …
}

/** Object-form export for callers that prefer a service handle. */
export const DrillStorageService = {
  save: saveDrill,
  loadAll: loadDrills,
};

export type DrillStorageServiceType = typeof DrillStorageService;
```

## Typed Storage Namespace

```typescript
const drills = createStorageNamespace<Drill>({ name: 'drills', version: 'v1' });

await drills.setItem(drill.id, drill);
const stored = await drills.getItem(drill.id); // Drill | null
```

`getItem` resolves to `null` for a missing or corrupt entry; `getAll` skips corrupt entries. Callers handle `null` — they never parse JSON themselves.

## Injectable Dependencies

Pass collaborators and sources of non-determinism through an options object with production defaults, so tests supply fakes without `jest.mock`:

```typescript
export interface ShuffleOptions {
  random?: () => number;
}

export const pickDelayMs = (
  minMs: number,
  maxMs: number,
  { random = Math.random }: ShuffleOptions = {},
): number => Math.round(minMs + random() * (maxMs - minMs));
```

## Custom Hook

```typescript
export function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);

  return debounced;
}
```

## Themed Style Factory

```typescript
const createStyles = (theme: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
      padding: theme.spacing.md,
    },
  });

// inside the component
const styles = useThemedStyles(createStyles);
```

## Ids and Timestamps

Use `generateId()` and `getTimestamp()` from `@utils` rather than calling `uuid` or `new Date().toISOString()` inline, so ids and timestamps stay consistent and easy to fake.
