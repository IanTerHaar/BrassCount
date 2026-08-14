/**
 * Domain model for a counting session.
 *
 * A session represents a discrete "count" event (e.g. a brass inventory
 * count) that the user can start, add entries to, and later revisit.
 *
 * The shape is intentionally minimal today; add optional fields as the
 * feature grows. Persistence is handled by `SessionStorageService` which
 * stores each session under a namespaced, versioned AsyncStorage key.
 */
export interface Session {
  /** Stable, unique identifier for the session. */
  id: string;
  /** Human-readable name / label for the session. */
  name: string;
  /** ISO-8601 timestamp of when the session was created. */
  createdAt: string;
  /** ISO-8601 timestamp of the last mutation to the session. */
  updatedAt: string;
  /** Free-form user notes. */
  notes?: string;
  /**
   * Individual count entries captured during the session.
   *
   * The persistence layer is agnostic to the entry shape so callers can
   * evolve this structure independently of storage.
   */
  entries?: SessionEntry[];
  /** Extensibility hook for feature-specific metadata. */
  metadata?: Record<string, unknown>;
}

export interface SessionEntry {
  id: string;
  label: string;
  count: number;
  capturedAt: string;
}

export type SessionInput = Omit<Session, 'createdAt' | 'updatedAt'> &
  Partial<Pick<Session, 'createdAt' | 'updatedAt'>>;
