/**
 * instrument-track.ts
 *
 * InstrumentAudioTrack — an AudioTrack whose buffer is automatically generated
 * and managed by an internal synth render loop.
 *
 * Contrast with recorded-track.ts where the buffer is manually provided by the
 * caller. Both tracks are managed identically by the player; the only difference
 * is how their sequences (and their underlying buffers) come to exist.
 *
 * createInstrumentTrack() must be called from within a Vue component's setup
 * context (or an explicit effectScope) because it uses Vue watchEffect internally.
 */

import { effectScope, ref, shallowReactive, watch, watchEffect } from "vue";
import {
  type MusicInstrumentType,
  type NoteDuration,
  type OctaveRange,
  PIANO_DEFAULT_OCTAVE_RANGE,
} from "../../../music/instruments";
import { createSynthWorkerClient, SynthEmptyTrackSignal } from "../../../music/synthWorker";
import { createInstrumentSequence } from "../../sequence/instrument/instrument-sequence";
import { createAudioTrack } from "../track";
import {
  DEFAULT_TIME_SIGNATURE,
  type InstrumentAudioTrack,
  type InstrumentTrackJSON,
  type InstrumentTrackKind,
  instrumentTrackKind,
  type PlacedNote,
  type TimeSignature,
} from "./index";

// ─── One shared synth worker client for the whole app ─────────────────────────

const synthClient = createSynthWorkerClient();

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create an InstrumentAudioTrack.
 *
 * The caller is responsible for registering the track with the player
 * (player.addTrack) and removing it (player.removeTrack + track.destroy())
 * — exactly as with createRecordedTrack.
 *
 * NOTE: Must be called inside a Vue component setup() or an effectScope()
 * because it uses watchEffect() internally.
 */
export function createInstrumentTrack(
  name: string,
  instrumentId: MusicInstrumentType,
  id?: string,
): InstrumentAudioTrack {
  return createAudioTrack<InstrumentTrackKind, InstrumentAudioTrack>(
    instrumentTrackKind,
    name,
    (base, dispatchEvent) => {
      // ── Mutable state ────────────────────────────────────────────────────────
      let timeSignature: TimeSignature = { ...DEFAULT_TIME_SIGNATURE };
      const bpmRef = ref(120);
      const notes = shallowReactive<PlacedNote[]>([]);
      let selectedNoteType: NoteDuration = "quarter";
      let pitchScrollTop = 0;
      let showWaveform = false;
      let octaveRange: OctaveRange = { ...PIANO_DEFAULT_OCTAVE_RANGE };

      // ── Synth render ─────────────────────────────────────────────────────────

      async function syncTrack() {
        let buffer: AudioBuffer;

        try {
          buffer = await synthClient.render({
            trackId: base.id,
            instrumentType: instrumentId,
            bpm: bpmRef.value,
            notes,
          });
        } catch (err) {
          if (err instanceof SynthEmptyTrackSignal) {
            for (const seq of base.getSequences()) {
              base.removeSequence(seq);
            }
            return;
          }
          if (err instanceof Error && err.message.includes("superseded")) {
            return; // a newer render is already in-flight — ignore
          }
          console.error("[createInstrumentTrack] render failed:", err);
          return;
        }

        // Replace all sequences with the newly-rendered one.
        for (const seq of base.getSequences()) {
          base.removeSequence(seq);
        }
        base.addSequence(createInstrumentSequence(buffer, 0));
      }

      // ── Reactive render loop ─────────────────────────────────────────────────
      // Wrapped in an effectScope so it can be stopped cleanly in destroy().
      // watchEffect runs immediately on first call, so it must be registered AFTER
      // `track` is assigned above to avoid a TDZ ReferenceError.

      const scope = effectScope();
      scope.run(() => {
        watchEffect(() => {
          // Reading these reactive values registers them as dependencies so Vue
          // re-runs syncTrack whenever any of them changes.
          // eslint-disable-next-line @typescript-eslint/no-unused-expressions
          notes.length;
          // eslint-disable-next-line @typescript-eslint/no-unused-expressions
          bpmRef.value;

          syncTrack();
        });

        // Watch the notes array for in-place mutations (push/splice from the
        // piano roll) that bypass the setter.  flush: "sync" ensures dirty
        // tracking fires immediately, not after the next tick.
        watch(notes, () => dispatchEvent({ type: "change" }), {
          flush: "sync",
        });
      });

      // ── Track object ─────────────────────────────────────────────────────────
      // Pre-declared so syncTrack() can close over `track` without a TDZ error.

      return {
        get instrumentId() {
          return instrumentId;
        },
        get timeSignature() {
          return timeSignature;
        },
        set timeSignature(value) {
          timeSignature = value;
          dispatchEvent({ type: "change" });
        },
        get bpm() {
          return bpmRef.value;
        },
        set bpm(value) {
          bpmRef.value = value;
          dispatchEvent({ type: "change" });
        },
        get notes() {
          return notes;
        },
        set notes(value) {
          notes.splice(0, notes.length, ...value);
          // The watch(notes, …) above will fire, so no extra dispatchEvent here.
        },
        get selectedNoteType() {
          return selectedNoteType;
        },
        set selectedNoteType(value) {
          selectedNoteType = value;
          dispatchEvent({ type: "change" });
        },
        get pitchScrollTop() {
          return pitchScrollTop;
        },
        set pitchScrollTop(value) {
          pitchScrollTop = value;
          dispatchEvent({ type: "change" });
        },
        get showWaveform() {
          return showWaveform;
        },
        set showWaveform(value) {
          showWaveform = value;
          dispatchEvent({ type: "change" });
        },
        get octaveRange() {
          return octaveRange;
        },
        set octaveRange(value) {
          octaveRange = { ...value };
          dispatchEvent({ type: "change" });
        },

        toJSON(): InstrumentTrackJSON {
          return {
            ...base.toJSON(),
            kind: instrumentTrackKind,
            instrumentId,
            bpm: bpmRef.value,
            timeSignature: { ...timeSignature },
            notes: notes.map((n) => ({ ...n })),
            selectedNoteType,
            pitchScrollTop,
            showWaveform,
            octaveRange: { ...octaveRange },
          };
        },

        destroy() {
          scope.stop();
        },
      };
    },
    id,
  );
}
