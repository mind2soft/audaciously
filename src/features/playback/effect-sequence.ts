// features/playback/effect-sequence.ts
// createEffectSequence — an AudioSequence that applies applyEffectChain
// between the buffer source node and the track's output node during playback.
//
// This is a new file in src/features/playback/ and does NOT modify any file
// under src/lib/audio/. It is used by build-tracks.ts to translate the new
// Track/Segment/ProjectNode data model into engine-compatible AudioTrack objects.

import type {
  AudioSequence,
  AudioSequenceEventMap,
  AudioSequenceJSON,
  AudioSequencePlayOptions,
} from "../../lib/audio/sequence/index";
import { trackPropertySymbol } from "../../lib/audio/sequence/index";
import type { AudioTrack } from "../../lib/audio/track";
import { createEmitter } from "../../lib/emitter";
import { applyEffectChain } from "../effects/apply-effects";
import type { AudioEffect } from "../effects/types";

// ── Concrete types ─────────────────────────────────────────────────────────────

/** The kind used by the wrapping RecordedTrack. */
export type EffectSequenceKind = "recorded";
export type EffectSequenceType = "effectSequence";
export const effectSequenceType: EffectSequenceType = "effectSequence";

export type EffectSequence = AudioSequence<EffectSequenceKind, EffectSequenceType>;

// ── Internal playback state ────────────────────────────────────────────────────

interface EffectSequenceState {
  context?: AudioContext;
  outputNode?: AudioNode;
  source?: AudioBufferSourceNode;
  effectNodes: AudioNode[];
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Creates an AudioSequence that plays `buffer` at `time` seconds on the
 * timeline, routing audio through `applyEffectChain(effects)` before reaching
 * the track's output node.
 *
 * Trim parameters:
 *   - `trimStart`: seconds to skip at the start of the buffer
 *   - `trimEnd`:   seconds to omit from the end of the buffer
 * Effective duration = max(0, buffer.duration − trimStart − trimEnd)
 *
 * @param buffer    AudioBuffer to play.
 * @param time      Start position on the timeline (seconds).
 * @param effects   Ordered effect list applied via applyEffectChain.
 * @param trimStart Trim at buffer start (seconds).
 * @param trimEnd   Trim at buffer end (seconds).
 * @param id        Optional stable ID (nanoid / UUID).
 */
export function createEffectSequence(
  buffer: AudioBuffer,
  time: number,
  effects: AudioEffect[],
  trimStart: number,
  trimEnd: number,
  id?: string,
): EffectSequence {
  const seqId = id ?? crypto.randomUUID();
  const state: EffectSequenceState = { effectNodes: [] };

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function _effectiveDuration(): number {
    return Math.max(0, buffer.duration - trimStart - trimEnd);
  }

  const { dispatchEvent, ...emitter } = createEmitter<
    AudioSequenceEventMap<EffectSequenceKind, EffectSequenceType>
  >((event) => {
    (event as { sequence: EffectSequence }).sequence = sequence;
    return event;
  });

  function _teardown(): void {
    if (state.source) {
      state.source.onended = null;
      try {
        state.source.stop();
      } catch {
        // Already stopped — ignore.
      }
      state.source = undefined;
    }
    for (const node of state.effectNodes) {
      try {
        node.disconnect();
      } catch {
        /* ignore */
      }
    }
    state.effectNodes = [];
    state.context = undefined;
    state.outputNode = undefined;
  }

  /**
   * Schedule the buffer source node into the audio graph.
   *
   * `currentTime` — the AudioContext.currentTime at the scheduling moment.
   * `startTime`   — the timeline cursor position (seconds) when play started.
   */
  function _schedule(
    context: AudioContext,
    outputNode: AudioNode,
    currentTime: number,
    startTime: number,
  ): void {
    const effectiveDuration = _effectiveDuration();
    // Skip segments that have already ended at the current seek position.
    if (time + effectiveDuration <= startTime) return;

    state.context = context;
    state.outputNode = outputNode;

    const source = context.createBufferSource();
    source.buffer = buffer;
    state.source = source;

    // Wire effects between source and the track output node.
    state.effectNodes = applyEffectChain(
      context,
      source,
      outputNode,
      effects,
      { offset: trimStart, duration: effectiveDuration },
      currentTime,
    );

    // Determine when and where in the buffer to start.
    if (time >= startTime) {
      // Segment starts in the future — schedule it relative to now.
      const scheduleAt = currentTime + (time - startTime);
      source.start(scheduleAt, trimStart);
    } else {
      // Segment already started — begin mid-buffer.
      const bufferOffset = startTime - time + trimStart;
      source.start(currentTime, bufferOffset);
    }

    source.onended = () => {
      _teardown();
      dispatchEvent({ type: "stop" });
    };
  }

  // ── Public sequence object ─────────────────────────────────────────────────

  // Internal track reference (set by AudioTrack.addSequence via the symbol).
  let _track: AudioTrack<"recorded">;

  const sequence: EffectSequence = {
    get [trackPropertySymbol]() {
      return _track;
    },
    set [trackPropertySymbol](value) {
      _track = value;
    },

    get type(): EffectSequenceType {
      return effectSequenceType;
    },
    get id(): string {
      return seqId;
    },
    get track() {
      return _track;
    },
    get time(): number {
      return time;
    },
    set time(value: number) {
      if (value !== time) {
        time = value;
        dispatchEvent({ type: "change" });
      }
    },
    get selected(): boolean {
      return false;
    },
    set selected(_v: boolean) {
      // Selection state not needed for engine-level playback objects.
    },
    get playbackRate(): number {
      return 1;
    },
    set playbackRate(_v: number) {
      // Not supported for effect sequences — rate is always 1.
    },
    get duration(): number {
      return _effectiveDuration();
    },
    get playbackDuration(): number {
      return _effectiveDuration();
    },
    get isPlaying(): boolean {
      return !!state.source;
    },

    async play(context: AudioContext, options: AudioSequencePlayOptions = {}): Promise<void> {
      if (state.source) return; // guard: already playing

      const currentTime = options.currentTime ?? context.currentTime;
      const startTime = options.startTime ?? 0;
      const outputNode = options.output ?? context.destination;

      _schedule(context, outputNode, currentTime, startTime);
      dispatchEvent({ type: "play" });
    },

    seek(seekTime: number): void {
      if (!state.context || !state.outputNode) return;

      const ctx = state.context;
      const output = state.outputNode;
      const currentTime = ctx.currentTime;

      _teardown();
      _schedule(ctx, output, currentTime, seekTime);
      dispatchEvent({ type: "seek" });
    },

    stop(): void {
      _teardown();
      dispatchEvent({ type: "stop" });
    },

    toJSON(): AudioSequenceJSON {
      return { id: seqId, time, playbackRate: 1 };
    },

    ...emitter,
  };

  return sequence;
}
