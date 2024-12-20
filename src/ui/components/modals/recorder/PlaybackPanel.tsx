import { createEffect, createSignal } from "solid-js";
import {
  RecorderState,
  useAudioRecorder,
} from "../../../../context/audio-recorder";
import {
  createAudioBuffer,
  getAudioBuffer,
  resampleAudioBuffer,
} from "../../../../utils/audio-buffers";
/* @ts-ignore */
import AudioPlayerProvider from "../../providers/AudioPlayerProvider";
import Waveform from "../../player/Waveform";
import AudioControls from "../../player/AudioControls";
import AudioTimerLabel from "../../player/AudioTimerLabel";
import { fillTone, melody } from "../../../../utils/sythetizer/tone";

const VISUAL_SAMPLE_RATE = 8000;

function PlaybackPanel() {
  const [recorderData, recorderControl] = useAudioRecorder();
  const [audioBuffer, setAudioBuffer] = createSignal<AudioBuffer>();
  const [waveAudioBuffer, setWaveAudioBuffer] = createSignal<AudioBuffer>();

  createEffect(() => {
    const blobs = recorderData();

    if (blobs?.length) {
      getAudioBuffer(blobs)
        .then((audioBuffer) => {
          setAudioBuffer(audioBuffer);
        })
        .catch(() => {
          setAudioBuffer();
        });
    } else {
      setAudioBuffer();
    }
  });

  createEffect(() => {
    if (!recorderControl.isActive()) return;

    //const buffer = audioBuffer();
    const buffer = createAudioBuffer(3); // TODO: remove this, restore audioBuffer() accessor

    melody(buffer, [
      { type: "note", frequency: 400 },
      { type: "note", frequency: 400 },
      { type: "note", frequency: 600 },
      { type: "note", frequency: 600 },
      { type: "note", frequency: 700 },
      { type: "note", frequency: 700 },
      { type: "note", frequency: 600 },
    ]);

    if (buffer) {
      setAudioBuffer(buffer); // TODO: remove this
      setWaveAudioBuffer(resampleAudioBuffer(buffer, VISUAL_SAMPLE_RATE));
    } else {
      setWaveAudioBuffer();
    }
  });

  return (
    <AudioPlayerProvider audioBuffer={audioBuffer()}>
      <div class="flex flex-col">
        <Waveform buffer={waveAudioBuffer()} />
        <div class="flex flex-row gap-3">
          <AudioControls />
          <AudioTimerLabel />
        </div>
      </div>
    </AudioPlayerProvider>
  );
}

export default PlaybackPanel;
