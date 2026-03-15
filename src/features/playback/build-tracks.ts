// features/playback/build-tracks.ts
// buildTracksFromStore — translates the new Track/Segment/ProjectNode data
// model from useSequenceStore + useNodesStore into engine-compatible
// AudioTrack<"recorded">[] objects ready for engine.setTracks().
//
// Each Segment becomes a createEffectSequence() that applies the referenced
// node's effects chain during playback.  Track volume/balance/mute/lock are
// copied from the store Track to the engine AudioTrack.
//
// NOTE: Timeline post-processor effects (useSequenceStore.timelineEffects)
// CANNOT be inserted between the engine's master GainNode and its AnalyserNode
// without modifying src/lib/audio/player.ts (which is kept as-is per spec).
// They are therefore not applied here. A comment marks the integration point.

import type { AudioTrack } from "../../lib/audio/track/index";
import { createRecordedTrack } from "../../lib/audio/track/recorded/recorded-track";
import type { Track } from "../sequence/track";
import type { ProjectNode, RecordedNode, InstrumentNode } from "../nodes";
import { createEffectSequence } from "./effect-sequence";

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Builds an array of engine AudioTrack objects from the store's Track list
 * and the node map.  Each segment that has an AudioBuffer is turned into an
 * EffectSequence so that node-level effects are applied during playback.
 *
 * Tracks that are muted OR have no playable segments are still included so
 * that the engine's totalDuration calculation remains accurate.
 *
 * @param tracks      The Track[] from useSequenceStore.tracks.value.
 * @param nodesById   The Map<string, ProjectNode> from useNodesStore.nodesById.value.
 */
export function buildTracksFromStore(
  tracks: Track[],
  nodesById: Map<string, ProjectNode>,
): AudioTrack<any>[] {
  const engineTracks: AudioTrack<any>[] = [];

  for (const track of tracks) {
    const engineTrack = createRecordedTrack(track.name, track.id);

    // Mirror track-level properties
    engineTrack.muted = track.muted;
    engineTrack.locked = track.locked;
    engineTrack.volume = track.volume;
    engineTrack.balance = track.balance;

    // Add a sequence for each segment that has a playable buffer
    for (const segment of track.segments) {
      const node = nodesById.get(segment.nodeId);
      if (!node || node.kind === "folder") continue;

      const audioNode = node as RecordedNode | InstrumentNode;
      const buffer = audioNode.targetBuffer;
      if (!buffer) continue; // no buffer yet (e.g. instrument still rendering)

      const effectSequence = createEffectSequence(
        buffer,
        segment.time,
        [], // effects are pre-baked into targetBuffer — no runtime chain needed
        segment.trimStart,
        segment.trimEnd,
        segment.id, // use segment id for stable identity
      );

      try {
        engineTrack.addSequence(effectSequence as any);
      } catch (err) {
        // Overlap conflict — skip the segment rather than crash.
        console.warn(
          `[buildTracksFromStore] Skipping segment "${segment.id}" due to overlap:`,
          err,
        );
      }
    }

    engineTracks.push(engineTrack);
  }

  // ── Timeline effects integration point ────────────────────────────────────
  // TODO: applyEffectChain for useSequenceStore.timelineEffects should be
  // applied between the engine's master GainNode and AnalyserNode.
  // This is not currently possible without modifying src/lib/audio/player.ts.
  // When player.ts is opened for editing in a future phase, add:
  //
  //   applyEffectChain(
  //     context,
  //     gainNode,         // master output (engine.getOutputNode())
  //     analyserNode,     // engine internal analyser
  //     timelineEffects,
  //     { offset: 0, duration: sequenceStore.totalDuration },
  //     context.currentTime,
  //   );
  // ─────────────────────────────────────────────────────────────────────────

  return engineTracks;
}
