/**
 * dirty-state.ts
 *
 * Granular dirty tracking for auto-save.  Instead of a single boolean "is
 * anything dirty?", this module tracks *which* entities changed *how*, so the
 * save logic can choose the cheapest DB operation for each change.
 *
 * Shape:
 *   {
 *     project:   { properties: boolean },
 *     tracks:    { [trackId]: { properties: boolean } },
 *     sequences: { [sequenceId]: { properties: boolean; buffer: boolean } },
 *   }
 *
 * All helpers are pure functions — they return new objects and never mutate
 * the input state.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DirtyProject {
  properties: boolean;
}

export interface DirtyTrack {
  properties: boolean;
}

export interface DirtySequence {
  properties: boolean;
  /** True when the raw AudioBuffer changed and must be re-compressed. */
  buffer: boolean;
}

export interface DirtyState {
  project: DirtyProject;
  tracks: Record<string, DirtyTrack>;
  sequences: Record<string, DirtySequence>;
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/** Create a fresh, fully-clean dirty state. */
export function createDirtyState(): DirtyState {
  return {
    project: { properties: false },
    tracks: {},
    sequences: {},
  };
}

// ─── Predicates ───────────────────────────────────────────────────────────────

/** Returns true if there is anything at all that needs saving. */
export function isDirtyStateEmpty(state: DirtyState): boolean {
  if (state.project.properties) return false;
  if (Object.keys(state.tracks).length > 0) return false;
  if (Object.keys(state.sequences).length > 0) return false;
  return true;
}

// ─── Mutation helpers (pure — return new state) ───────────────────────────────

/** Mark project-level properties (name, author, etc.) as dirty. */
export function markProjectDirty(state: DirtyState): DirtyState {
  if (state.project.properties) return state; // already dirty — no-op
  return { ...state, project: { properties: true } };
}

/** Mark a track's properties as dirty (add/update). */
export function markTrackDirty(state: DirtyState, trackId: string): DirtyState {
  const existing = state.tracks[trackId];
  if (existing?.properties) return state; // already dirty — no-op
  return {
    ...state,
    tracks: {
      ...state.tracks,
      [trackId]: { properties: true },
    },
  };
}

/** Mark a sequence as dirty.  Pass only the flags that changed. */
export function markSequenceDirty(
  state: DirtyState,
  sequenceId: string,
  flags: Partial<DirtySequence>,
): DirtyState {
  const existing = state.sequences[sequenceId] ?? {
    properties: false,
    buffer: false,
  };

  // If all requested flags are already set, nothing to do.
  const propertiesAlreadySet = !flags.properties || existing.properties;
  const bufferAlreadySet = !flags.buffer || existing.buffer;
  if (propertiesAlreadySet && bufferAlreadySet) return state;

  return {
    ...state,
    sequences: {
      ...state.sequences,
      [sequenceId]: {
        properties: existing.properties || !!flags.properties,
        buffer: existing.buffer || !!flags.buffer,
      },
    },
  };
}

/** Remove a track entry (called after the track has been deleted from the DB). */
export function clearTrackDirty(state: DirtyState, trackId: string): DirtyState {
  if (!(trackId in state.tracks)) return state;
  const { [trackId]: _removed, ...rest } = state.tracks;
  return { ...state, tracks: rest };
}

/** Remove a sequence entry (called after the sequence has been saved/deleted). */
export function clearSequenceDirty(state: DirtyState, sequenceId: string): DirtyState {
  if (!(sequenceId in state.sequences)) return state;
  const { [sequenceId]: _removed, ...rest } = state.sequences;
  return { ...state, sequences: rest };
}

/** Reset the entire dirty state to clean. */
export function clearDirtyState(_state: DirtyState): DirtyState {
  return createDirtyState();
}
