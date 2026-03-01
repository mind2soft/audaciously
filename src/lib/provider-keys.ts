export const sideMenuId = "side-menu-trigger" as const;

export const recorderKey = Symbol.for("@recorder");
export const playerKey = Symbol.for("@player");
export const timelineKey = Symbol.for("@timeline");
export const toolsKey = Symbol.for("@tools");
export const selectedTrackKey = Symbol.for("@selectedTrack");

export const instrumentTracksKey = Symbol.for("@instrumentTracks");
export const selectedInstrumentTrackKey = Symbol.for("@selectedInstrumentTrack");

/**
 * Provides a Map<instrumentTrackId, AudioTrack> of the hidden AudioTracks
 * that useInstrumentPlayback keeps in the player.  Components can look up
 * the rendered AudioTrack for any InstrumentTrack by its id.
 */
export const instrumentAudioTracksKey = Symbol.for("@instrumentAudioTracks");

