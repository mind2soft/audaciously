// composables/useInstrumentAudioNode.ts
// Typed reactive accessor + mutations for an InstrumentNode.
//
// Takes a nodeId string, returns ComputedRef properties and mutation methods.
// Components use this instead of receiving a full node object via props,
// keeping the reactive surface narrow and type-safe.
//
// When `pipeline: true` is passed, also sets up the synth render → effect bake
// → store.setTargetBuffer reactive loop. Only the view component should enable
// the pipeline; property panels use reads + mutations only.

import { type ComputedRef, computed, onScopeDispose, type Ref, ref, watch } from "vue";
import { createEffectByType } from "../features/effects";
import type { AudioEffect, AudioEffectType } from "../features/effects/types";
import type { InstrumentNode } from "../features/nodes";
import { computeTargetBuffer } from "../features/nodes/compute-target-buffer";
import type { PlacedNote, TimeSignature } from "../features/nodes/instrument/instrument-node";
import { getBuffer } from "../lib/audio/audio-buffer-repository";
import type { MusicInstrumentType, NoteDuration, OctaveRange } from "../lib/music/instruments";
import { createSynthWorkerClient, SynthEmptyTrackSignal } from "../lib/music/synthWorker";
import { useNodesStore } from "../stores/nodes";

// ── Module-level synth client ─────────────────────────────────────────────────
// One client is sufficient for the whole application — the underlying worker
// uses per-track seqNum cancellation to handle rapid note edits cleanly.
const synthClient = createSynthWorkerClient();

export interface UseInstrumentAudioNodeOptions {
  /** When true, starts the reactive synth render + effect-bake pipeline. Default false. */
  pipeline?: boolean;
}

export interface UseInstrumentAudioNode {
  // Reactive reads
  name: ComputedRef<string>;
  instrumentType: ComputedRef<MusicInstrumentType>;
  bpm: ComputedRef<number>;
  notes: ComputedRef<PlacedNote[]>;
  timeSignature: ComputedRef<TimeSignature>;
  selectedNoteType: ComputedRef<NoteDuration>;
  octaveRange: ComputedRef<OctaveRange>;
  pitchScrollTop: ComputedRef<number>;
  showWaveform: ComputedRef<boolean>;
  targetBuffer: ComputedRef<AudioBuffer | null>;
  effects: ComputedRef<AudioEffect[]>;

  /** True while synth render or effect bake is in progress (always false when pipeline disabled). */
  isComputing: Ref<boolean>;

  // Mutations
  rename(newName: string): void;
  setBpm(bpm: number): void;
  setNotes(notes: PlacedNote[]): void;
  setTimeSignature(ts: TimeSignature): void;
  setSelectedNoteType(noteType: NoteDuration): void;
  setOctaveRange(range: OctaveRange): void;
  setPitchScrollTop(top: number): void;
  setShowWaveform(show: boolean): void;
  setEffects(effects: AudioEffect[]): void;
  addEffect(type: AudioEffectType): void;
  removeEffect(effectId: string): void;
  reorderEffects(fromIndex: number, toIndex: number): void;
}

/**
 * Typed reactive accessor for an InstrumentNode.
 *
 * @param nodeId - ID of the node in the store. Must exist and be kind "instrument".
 * @param options - Pass `{ pipeline: true }` to enable the synth render + effect-bake loop.
 * @throws If the node is not found or is the wrong kind (developer error).
 */
export function useInstrumentAudioNode(
  nodeId: string,
  options?: UseInstrumentAudioNodeOptions,
): UseInstrumentAudioNode {
  const store = useNodesStore();

  /** Resolve the node from the reactive Map, asserting correct kind. */
  function getNode(): InstrumentNode {
    const node = store.nodesById.get(nodeId);
    if (!node) throw new Error(`Node "${nodeId}" not found`);
    if (node.kind !== "instrument") {
      throw new Error(`Node "${nodeId}" is "${node.kind}", expected "instrument"`);
    }
    return node;
  }

  // ── Reactive reads ──────────────────────────────────────────────────────

  const name = computed(() => getNode().name);
  const instrumentType = computed(() => getNode().instrumentType);
  const bpm = computed(() => getNode().bpm);
  const notes = computed(() => getNode().notes);
  const timeSignature = computed(() => getNode().timeSignature);
  const selectedNoteType = computed(() => getNode().selectedNoteType);
  const octaveRange = computed(() => getNode().octaveRange);
  const pitchScrollTop = computed(() => getNode().pitchScrollTop);
  const showWaveform = computed(() => getNode().showWaveform);
  const targetBuffer = computed(() => {
    const id = getNode().targetBufferId;
    return id ? (getBuffer(id) ?? null) : null;
  });
  const effects = computed(() => getNode().effects);

  // ── Mutations ───────────────────────────────────────────────────────────

  function rename(newName: string): void {
    getNode().name = newName;
  }

  function setBpm(newBpm: number): void {
    getNode().bpm = newBpm;
  }

  function setNotes(newNotes: PlacedNote[]): void {
    getNode().notes = newNotes;
  }

  function setTimeSignature(ts: TimeSignature): void {
    getNode().timeSignature = { ...ts };
  }

  function setSelectedNoteType(noteType: NoteDuration): void {
    getNode().selectedNoteType = noteType;
  }

  function setOctaveRange(range: OctaveRange): void {
    getNode().octaveRange = { ...range };
  }

  function setPitchScrollTop(top: number): void {
    getNode().pitchScrollTop = top;
  }

  function setShowWaveform(show: boolean): void {
    getNode().showWaveform = show;
  }

  function setEffects(newEffects: AudioEffect[]): void {
    getNode().effects = newEffects;
  }

  function addEffect(type: AudioEffectType): void {
    const node = getNode();
    // Enforce one instance per effect type
    if (node.effects.some((e) => e.type === type)) return;

    const effect = createEffectByType(type);
    node.effects.push(effect);
  }

  function removeEffect(effectId: string): void {
    const node = getNode();
    const idx = node.effects.findIndex((e) => e.id === effectId);
    if (idx !== -1) node.effects.splice(idx, 1);
  }

  function reorderEffects(fromIndex: number, toIndex: number): void {
    const node = getNode();
    if (
      fromIndex < 0 ||
      fromIndex >= node.effects.length ||
      toIndex < 0 ||
      toIndex >= node.effects.length
    ) {
      return;
    }
    const [moved] = node.effects.splice(fromIndex, 1);
    node.effects.splice(toIndex, 0, moved);
  }

  // ── Pipeline (opt-in) ─────────────────────────────────────────────────────

  const isComputing = ref(false);

  if (options?.pipeline) {
    // ONE AbortController per regeneration cycle.
    let controller: AbortController | null = null;

    // Single watcher covering ALL inputs.
    watch(
      () => {
        const node = getNode();
        return {
          id: node.id,
          instrumentType: node.instrumentType,
          bpm: node.bpm,
          tsBeatsPerMeasure: node.timeSignature.beatsPerMeasure,
          tsBeatUnit: node.timeSignature.beatUnit,
          notes: node.notes.map((n) => ({
            id: n.id,
            pitchKey: n.pitchKey,
            startBeat: n.startBeat,
            durationBeats: n.durationBeats,
          })),
          // Snapshot effects for deep comparison (strips Vue reactive proxies).
          effects: JSON.parse(JSON.stringify(node.effects)) as AudioEffect[],
        };
      },
      async (curr) => {
        // Abort any in-progress cycle.
        if (controller) controller.abort();

        // Fresh controller for this cycle.
        controller = new AbortController();
        const { signal } = controller;

        isComputing.value = true;

        try {
          // ── Step 1: Synth render ────────────────────────────────────────
          const rawBuffer = await synthClient.render({
            trackId: curr.id,
            instrumentType: curr.instrumentType,
            bpm: curr.bpm,
            notes: curr.notes,
          });

          if (signal.aborted) return;

          // ── Step 2: Effect processing ──────────────────────────────────
          const target = await computeTargetBuffer(rawBuffer, curr.effects, signal, curr.id);

          if (signal.aborted) return;

          // ── Step 3: Store update ───────────────────────────────────────
          store.setTargetBuffer(curr.id, target);
        } catch (err) {
          if (signal.aborted) return;

          if (err instanceof SynthEmptyTrackSignal) {
            // No notes → clear target buffer.
            store.setTargetBuffer(curr.id, null);
            return;
          }

          // Worker error — retain previous targetBuffer so playback continues.
        } finally {
          if (!signal.aborted) isComputing.value = false;
        }
      },
      { deep: true, immediate: true },
    );

    // Abort any in-flight cycle when the enclosing effect scope is disposed.
    onScopeDispose(() => {
      controller?.abort();
    });
  }

  return {
    name,
    instrumentType,
    bpm,
    notes,
    timeSignature,
    selectedNoteType,
    octaveRange,
    pitchScrollTop,
    showWaveform,
    targetBuffer,
    effects,
    isComputing,
    rename,
    setBpm,
    setNotes,
    setTimeSignature,
    setSelectedNoteType,
    setOctaveRange,
    setPitchScrollTop,
    setShowWaveform,
    setEffects,
    addEffect,
    removeEffect,
    reorderEffects,
  };
}
