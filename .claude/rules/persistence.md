---
paths:
  - 'src/services/**/*.ts'
---

# Persistence Rules

- Never import `@react-native-async-storage/async-storage` outside `services/storage.ts`. Every other module — domain services, screens, hooks — goes through `createStorageNamespace<T>()` or a domain service built on it.
- Give every namespace a `version` (default `'v1'`). When a stored type's shape changes in a breaking way, bump the version rather than mutating the shape in place, and write a migration that reads the old version's key prefix.
- A domain service stamps its own `createdAt`/`updatedAt` (or equivalent) timestamps — never accept them from the caller as input.
- Wrap failures in `StorageError` (or let the ones raised by `storage.ts` propagate) rather than letting raw AsyncStorage errors or JSON parse errors reach UI code.
- A method that lists records should return a stable, documented order (e.g. `loadSessions()` sorts by `updatedAt` descending) rather than raw storage iteration order.
- ID-bearing operations (`load/save/delete...ById`) validate the id up front and throw `StorageError` for an empty/invalid one before touching storage.
