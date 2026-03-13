// stores/sequence.ts
// useSequenceStore — manages the Sequence (tracks + segments + timeline effects).
// See: .opencode/context/refactor/03-state-management.md (P2-04)
//
// Constraint: FolderNode cannot be placed as a segment (guarded by addSegment).
// Constraint: Segments on the same track cannot overlap.

import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { Track } from "../features/sequence/track";
import { createTrack } from "../features/sequence/track";
import type { Segment } from "../features/sequence/segment";
import { createSegment } from "../features/sequence/segment";
import type { AudioEffect, AudioEffectType } from "../features/effects";
import {
  createGainEffect,
  createBalanceEffect,
  createFadeInEffect,
  createFadeOutEffect,
} from "../features/effects";
import { useNodesStore } from "./nodes";

// ── Serialization types ────────────────────────────────────────────────────────

export interface SequenceJSON {
  tracks: Track[];
  timelineEffects: AudioEffect[];
  selectedSegmentId: string | null;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useSequenceStore = defineStore("sequence", () => {
  // ── State ─────────────────────────────────────────────────────────────────
  /** All tracks in the timeline, in display order. */
  const tracks = ref<Track[]>([createTrack("Track 1")]);
  /** Post-processing effects applied on top of the full timeline mix. */
  const timelineEffects = ref<AudioEffect[]>([]);
  /** Currently selected segment id. */
  const selectedSegmentId = ref<string | null>(null);

  // ── Computed ──────────────────────────────────────────────────────────────

  /** Total timeline duration = latest segment end time across all tracks. */
  const totalDuration = computed((): number => {
    const nodesStore = useNodesStore();
    let max = 0;
    for (const track of tracks.value) {
      for (const seg of track.segments) {
        const node = nodesStore.nodesById.get(seg.nodeId);
        const bufferDuration =
          node && node.kind !== "folder" && (node as any).buffer
            ? (node as any).buffer.duration
            : 0;
        const end = seg.time + Math.max(0, bufferDuration - seg.trimStart - seg.trimEnd);
        if (end > max) max = end;
      }
    }
    return max;
  });

  // ── Internal helpers ──────────────────────────────────────────────────────

  function _findTrack(id: string): Track | undefined {
    return tracks.value.find((t) => t.id === id);
  }

  function _findSegment(id: string): { track: Track; segment: Segment } | undefined {
    for (const track of tracks.value) {
      const segment = track.segments.find((s) => s.id === id);
      if (segment) return { track, segment };
    }
    return undefined;
  }

  // ── Track actions ─────────────────────────────────────────────────────────

  function addTrack(name?: string): Track {
    const sortOrder = tracks.value.length;
    const track = createTrack(name ?? `Track ${sortOrder + 1}`);
    track.sortOrder = sortOrder;
    tracks.value.push(track);
    return track;
  }

  function removeTrack(id: string): void {
    const idx = tracks.value.findIndex((t) => t.id === id);
    if (idx !== -1) {
      tracks.value.splice(idx, 1);
      // Update sortOrders
      tracks.value.forEach((t, i) => (t.sortOrder = i));
    }
  }

  function renameTrack(id: string, name: string): void {
    const track = _findTrack(id);
    if (track) track.name = name;
  }

  function reorderTracks(fromIndex: number, toIndex: number): void {
    if (
      fromIndex < 0 ||
      fromIndex >= tracks.value.length ||
      toIndex < 0 ||
      toIndex >= tracks.value.length
    )
      return;
    const [moved] = tracks.value.splice(fromIndex, 1);
    tracks.value.splice(toIndex, 0, moved);
    tracks.value.forEach((t, i) => (t.sortOrder = i));
  }

  function setTrackHeight(id: string, height: number): void {
    const track = _findTrack(id);
    if (track) track.height = Math.max(32, height);
  }

  function setTrackMuted(id: string, muted: boolean): void {
    const track = _findTrack(id);
    if (track) track.muted = muted;
  }

  function setTrackLocked(id: string, locked: boolean): void {
    const track = _findTrack(id);
    if (track) track.locked = locked;
  }

  function setTrackVolume(id: string, volume: number): void {
    const track = _findTrack(id);
    if (track) track.volume = Math.max(0, Math.min(3, volume));
  }

  function setTrackBalance(id: string, balance: number): void {
    const track = _findTrack(id);
    if (track) track.balance = Math.max(-1, Math.min(1, balance));
  }

  // ── Segment actions ────────────────────────────────────────────────────────

  /**
   * Place a node as a segment on a track.
   * GUARD: FolderNode cannot be placed as a segment.
   */
  function addSegment(trackId: string, nodeId: string, time: number): Segment {
    const nodesStore = useNodesStore();
    const node = nodesStore.nodesById.get(nodeId);
    if (!node) throw new Error(`Node not found: ${nodeId}`);
    if (node.kind === "folder") {
      throw new Error("FolderNode cannot be placed as a segment.");
    }

    const track = _findTrack(trackId);
    if (!track) throw new Error(`Track not found: ${trackId}`);

    const segment = createSegment(nodeId, Math.max(0, time));
    track.segments.push(segment);
    return segment;
  }

  function removeSegment(id: string): void {
    for (const track of tracks.value) {
      const idx = track.segments.findIndex((s) => s.id === id);
      if (idx !== -1) {
        track.segments.splice(idx, 1);
        if (selectedSegmentId.value === id) selectedSegmentId.value = null;
        return;
      }
    }
  }

  function moveSegment(id: string, newTime: number, newTrackId?: string): void {
    const found = _findSegment(id);
    if (!found) return;
    const { track, segment } = found;

    segment.time = Math.max(0, newTime);

    if (newTrackId && newTrackId !== track.id) {
      const newTrack = _findTrack(newTrackId);
      if (!newTrack) return;
      const idx = track.segments.findIndex((s) => s.id === id);
      if (idx !== -1) {
        track.segments.splice(idx, 1);
        newTrack.segments.push(segment);
      }
    }
  }

  function trimSegmentStart(id: string, trimStart: number): void {
    const found = _findSegment(id);
    if (found) found.segment.trimStart = Math.max(0, trimStart);
  }

  function trimSegmentEnd(id: string, trimEnd: number): void {
    const found = _findSegment(id);
    if (found) found.segment.trimEnd = Math.max(0, trimEnd);
  }

  function selectSegment(id: string | null): void {
    selectedSegmentId.value = id;
  }

  // ── Timeline effects ───────────────────────────────────────────────────────

  function addTimelineEffect(type: AudioEffectType): void {
    // Enforce one instance per type
    if (timelineEffects.value.some((e) => e.type === type)) return;

    let effect: AudioEffect;
    switch (type) {
      case "gain":
        effect = createGainEffect();
        break;
      case "balance":
        effect = createBalanceEffect();
        break;
      case "fadeIn":
        effect = createFadeInEffect();
        break;
      case "fadeOut":
        effect = createFadeOutEffect();
        break;
    }
    timelineEffects.value.push(effect);
  }

  function removeTimelineEffect(id: string): void {
    const idx = timelineEffects.value.findIndex((e) => e.id === id);
    if (idx !== -1) timelineEffects.value.splice(idx, 1);
  }

  function reorderTimelineEffects(fromIndex: number, toIndex: number): void {
    if (
      fromIndex < 0 ||
      fromIndex >= timelineEffects.value.length ||
      toIndex < 0 ||
      toIndex >= timelineEffects.value.length
    )
      return;
    const [moved] = timelineEffects.value.splice(fromIndex, 1);
    timelineEffects.value.splice(toIndex, 0, moved);
  }

  function setTimelineEffectValue(id: string, key: string, value: number): void {
    const effect = timelineEffects.value.find((e) => e.id === id);
    if (effect && key in effect) {
      (effect as any)[key] = value;
    }
  }

  function toggleTimelineEffect(id: string): void {
    const effect = timelineEffects.value.find((e) => e.id === id);
    if (effect) effect.enabled = !effect.enabled;
  }

  // ── Serialization ─────────────────────────────────────────────────────────

  function toJSON(): SequenceJSON {
    return {
      tracks: JSON.parse(JSON.stringify(tracks.value)),
      timelineEffects: JSON.parse(JSON.stringify(timelineEffects.value)),
      selectedSegmentId: selectedSegmentId.value,
    };
  }

  function fromJSON(data: SequenceJSON): void {
    tracks.value = data.tracks ?? [createTrack("Track 1")];
    timelineEffects.value = data.timelineEffects ?? [];
    selectedSegmentId.value = data.selectedSegmentId ?? null;
  }

  function clear(): void {
    tracks.value = [createTrack("Track 1")];
    timelineEffects.value = [];
    selectedSegmentId.value = null;
  }

  return {
    // state
    tracks,
    timelineEffects,
    selectedSegmentId,
    // computed
    totalDuration,
    // track actions
    addTrack,
    removeTrack,
    renameTrack,
    reorderTracks,
    setTrackHeight,
    setTrackMuted,
    setTrackLocked,
    setTrackVolume,
    setTrackBalance,
    // segment actions
    addSegment,
    removeSegment,
    moveSegment,
    trimSegmentStart,
    trimSegmentEnd,
    selectSegment,
    // timeline effects
    addTimelineEffect,
    removeTimelineEffect,
    reorderTimelineEffects,
    setTimelineEffectValue,
    toggleTimelineEffect,
    // serialization
    toJSON,
    fromJSON,
    clear,
  };
});
