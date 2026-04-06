// composables/useRecordedAudioNode.ts
// Typed reactive accessor + mutations for a RecordedNode.
//
// Takes a nodeId string, returns ComputedRef properties and mutation methods.
// Components use this instead of receiving a full node object via props,
// keeping the reactive surface narrow and type-safe.
//
// When `pipeline: true` is passed, also sets up the reactive effect-bake loop
// (sourceBuffer + effects → computeTargetBuffer → store.setTargetBuffer).
// Only the view component should enable the pipeline; property panels use
// reads + mutations only.

import { type ComputedRef, computed, type Ref, ref, watch } from "vue";
import { createEffectByType } from "../features/effects";
import type { AudioEffect, AudioEffectType } from "../features/effects/types";
import type { RecordedNode } from "../features/nodes";
import { computeTargetBuffer } from "../features/nodes/compute-target-buffer";
import {
  getBuffer,
  getPristineChannels,
  registerBuffer,
  removeBuffer,
} from "../lib/audio/audio-buffer-repository";
import { useNodesStore } from "../stores/nodes";
import { useAudioPipeline } from "./useAudioPipeline";

export interface UseRecordedAudioNodeOptions {
  /** When true, starts the reactive effect-bake pipeline. Default false. */
  pipeline?: boolean;
}

export interface UseRecordedAudioNode {
  // Reactive reads
  name: ComputedRef<string>;
  sourceBuffer: ComputedRef<AudioBuffer | null>;
  targetBuffer: ComputedRef<AudioBuffer | null>;
  isRecording: ComputedRef<boolean>;
  effects: ComputedRef<AudioEffect[]>;

  /** True while an async effect bake is in progress (always false when pipeline disabled). */
  isComputing: Ref<boolean>;

  // Mutations
  rename(newName: string): void;
  setSourceBuffer(buffer: AudioBuffer | null): void;
  setRecordingState(recording: boolean): void;
  setEffects(effects: AudioEffect[]): void;
  addEffect(type: AudioEffectType): void;
  removeEffect(effectId: string): void;
  reorderEffects(fromIndex: number, toIndex: number): void;
}

/**
 * Typed reactive accessor for a RecordedNode.
 *
 * @param nodeId - ID of the node in the store. Must exist and be kind "recorded".
 * @param options - Pass `{ pipeline: true }` to enable the reactive effect-bake loop.
 * @throws If the node is not found or is the wrong kind (developer error).
 */
export function useRecordedAudioNode(
  nodeId: string,
  options?: UseRecordedAudioNodeOptions,
): UseRecordedAudioNode {
  const store = useNodesStore();

  /** Resolve the node from the reactive Map, asserting correct kind. */
  function getNode(): RecordedNode {
    const node = store.nodesById.get(nodeId);
    if (!node) throw new Error(`Node "${nodeId}" not found`);
    if (node.kind !== "recorded") {
      throw new Error(`Node "${nodeId}" is "${node.kind}", expected "recorded"`);
    }
    return node;
  }

  // ── Reactive reads ──────────────────────────────────────────────────────

  const name = computed(() => getNode().name);
  const sourceBuffer = computed(() => {
    const id = getNode().sourceBufferId;
    return id ? (getBuffer(id) ?? null) : null;
  });
  const targetBuffer = computed(() => {
    const id = getNode().targetBufferId;
    return id ? (getBuffer(id) ?? null) : null;
  });
  const isRecording = computed(() => getNode().isRecording);
  const effects = computed(() => getNode().effects);

  // ── Mutations ───────────────────────────────────────────────────────────

  function rename(newName: string): void {
    getNode().name = newName;
  }

  function setSourceBuffer(buffer: AudioBuffer | null): void {
    const node = getNode();
    // Remove old source buffer from repository
    if (node.sourceBufferId) {
      removeBuffer(node.sourceBufferId);
    }
    // Register new buffer with pristine channel snapshots (or clear)
    node.sourceBufferId = buffer ? registerBuffer(buffer, { pristine: true }) : null;
  }

  function setRecordingState(recording: boolean): void {
    getNode().isRecording = recording;
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
    const pipelineSource = computed(() => {
      const id = getNode().sourceBufferId;
      return id ? (getBuffer(id) ?? null) : null;
    });
    const pipelinePristine = computed(() => {
      const id = getNode().sourceBufferId;
      return id ? getPristineChannels(id) : undefined;
    });
    const pipelineEffects = computed(() => getNode().effects);
    const pipelineNodeId = computed(() => nodeId);

    const { targetBuffer: pipelineTarget, isProcessing } = useAudioPipeline(
      pipelineSource,
      pipelineEffects,
      {
        processFn: computeTargetBuffer,
        nodeId: pipelineNodeId,
        pristineChannels: pipelinePristine,
      },
    );

    // Sync pipeline output → store
    watch(pipelineTarget, (buffer) => {
      store.setTargetBuffer(nodeId, buffer);
    });

    // Mirror isProcessing into the returned isComputing ref
    watch(isProcessing, (v) => {
      isComputing.value = v;
    });
  }

  return {
    name,
    sourceBuffer,
    targetBuffer,
    isRecording,
    effects,
    isComputing,
    rename,
    setSourceBuffer,
    setRecordingState,
    setEffects,
    addEffect,
    removeEffect,
    reorderEffects,
  };
}
