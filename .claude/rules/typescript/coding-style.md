---
paths:
  - '**/*.ts'
  - '**/*.tsx'
  - '**/*.js'
  - '**/*.jsx'
---

# TypeScript/JavaScript Coding Style

> This file extends [common/coding-style.md](../common/coding-style.md) with TypeScript/JavaScript specific content.
> TypeScript 6, strict mode via `@react-native/typescript-config`. Formatting is Prettier's job (`singleQuote`, `trailingComma: 'all'`, `arrowParens: 'avoid'`) — never hand-format against it.

## Types and Interfaces

### Public APIs

- Add parameter and return types to exported functions, services and hooks
- Let TypeScript infer obvious local variable types
- Extract repeated inline object shapes into named types

```typescript
// WRONG: exported function with an implicit return type
export const formatSeconds = (seconds: number) => `${seconds.toFixed(2)}s`;

// CORRECT
export const formatSeconds = (seconds: number): string =>
  `${seconds.toFixed(2)}s`;
```

### Interfaces vs. Type Aliases

- `interface` for contracts that are implemented or extended: domain models (`Session`), service handles (`StorageNamespace<T>`), option bags
- `type` for component props, unions, mapped types, and anything derived (`keyof`, `typeof`, `Omit`, `Pick`)
- String literal unions instead of `enum`
- Derive types from values where a value is the source of truth (`type TypographyVariant = keyof Typography`), and use `as const satisfies …` for token tables

```typescript
export interface Session {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export type SessionInput = Omit<Session, 'createdAt' | 'updatedAt'> &
  Partial<Pick<Session, 'createdAt' | 'updatedAt'>>;

type Phase = 'idle' | 'waiting' | 'running';
```

### Avoid `any`

- No `any` in application code
- Use `unknown` for external or untrusted input, then narrow it
- Use generics when a value's type depends on the caller
- `as` is acceptable at a trust boundary you have just checked (`JSON.parse(raw) as T` inside the storage layer); it is not a way to silence an error

```typescript
// WRONG: any removes type safety
const messageOf = (error: any) => error.message;

// CORRECT: unknown forces safe narrowing
const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unexpected error';
```

### Component Props

- Define props as a named `type` and type callbacks explicitly
- Do not use `React.FC`

```tsx
type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  testID?: string;
};

export const Chip = ({ label, selected = false, onPress }: ChipProps) => (
  <TouchableOpacity
    onPress={onPress}
    accessibilityRole="button"
    accessibilityState={{ selected }}
  >
    <Typography variant="label">{label}</Typography>
  </TouchableOpacity>
);
```

### JavaScript Files

The only `.js` files are tooling: root config files and `.claude/hooks/`. They are CommonJS; use JSDoc where types improve clarity. Application code is always TypeScript.

## Immutability

Return new objects and arrays; never mutate arguments, state or stored records.

```typescript
// WRONG: mutation
const rename = (session: Session, name: string): Session => {
  session.name = name;
  return session;
};

// CORRECT
const rename = (session: Readonly<Session>, name: string): Session => ({
  ...session,
  name,
});
```

`Array.prototype.sort` mutates — sort a copy (`[...items].sort(…)` or `toSorted`) unless the array was created in the same function.

## Error Handling

- Use `async`/`await` with `try`/`catch`; type the caught value as `unknown` and narrow it.
- In services, wrap the low-level failure in the service's error class and keep the original as `cause`.
- In screens, catch the service error and put a user-readable message in state.
- Every promise is awaited, returned, or given a `.catch` — no floating promises in handlers or effects.

```typescript
export class StorageError extends Error {
  cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'StorageError';
    this.cause = cause;
  }
}

try {
  await AsyncStorage.setItem(key, payload);
} catch (err) {
  throw new StorageError(`Failed to write key "${key}"`, err);
}
```

## Input Validation

No schema library is installed. Validate with explicit guards at the boundary and fail fast:

```typescript
if (!Number.isFinite(parSeconds) || parSeconds < 0) {
  throw new RangeError('Par time must be a non-negative number');
}
```

## Console

- No `console.log` in committed code
- Report failures through thrown errors and UI state
