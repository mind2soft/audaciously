import { createEffect, createSignal, onCleanup } from "solid-js";
import { throttle } from "@solid-primitives/scheduled";
// import { useAudioPlayer } from "../../../context/audio-player";
// import { AudioState } from "@solid-primitives/audio";
/* @ts-ignore */
import { linearPath } from "waveform-path";

export interface WaveformProps {
  buffer?: AudioBuffer;
}

function getPath(audioBuffer: AudioBuffer, svg: SVGSVGElement) {
  return linearPath(audioBuffer, {
    samples: audioBuffer.length,
    type: "mirror",
    top: 0,
    height: svg.clientHeight,
    width: svg.clientWidth,
    paths: [{ d: "V", sy: 0, x: 50, ey: 100 }],
    animation: false,
    normalize: false,
  });
}

function Waveform(props: WaveformProps) {
  let svgRef: SVGSVGElement | undefined;
  let svgPathRef: SVGPathElement | undefined;

  // const player = useAudioPlayer();
  const [playOffset, setPlayOffset] = createSignal("0%");
  const [seeking, setSeeking] = createSignal(false);

  const handleMouseDown = (e: MouseEvent) => {
    if (e.button === 0) {
      //setSeeking(true);
      // if (playerState.state === AudioState.PLAYING) {
      //   playerControls.pause();
      //   playerControls.seek(0);
      //   console.log("Stop");
      // } else {
      //   playerControls.play();
      //   console.log("playing");
      // }
    }
  };
  const handleMouseUp = () => {
    setSeeking(false);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (seeking()) {
      // TODO
    }
  };

  // createEffect(() => {
  //   //const buffer = props.buffer;
  //   // const player = playerState.player;
  //   const handleTimeUpdate = throttle(() => {
  //     const playoffset = (player.currentTime / player.duration) * 100;

  //     console.log(playoffset);
  //     setPlayOffset(`${playoffset}%`);
  //   }, 100);

  //   player.addEventListener("timeupdate", handleTimeUpdate);

  //   onCleanup(() => {
  //     player.removeEventListener("timeupdate", handleTimeUpdate);
  //   });
  // });

  createEffect(() => {
    const buffer = props.buffer;
    //const position = currentTime();

    if (svgRef && buffer?.length) {
      //const offsetRatio = position / buffer.duration;

      svgPathRef?.setAttribute("d", getPath(buffer, svgRef));
    } else {
      svgPathRef?.removeAttribute("d");
    }
  });

  createEffect(() => {
    document.addEventListener("mousemove", handleMouseMove);

    onCleanup(() => document.removeEventListener("mousemove", handleMouseMove));
  });

  return (
    <svg
      ref={svgRef}
      class="w-full h-40"
      on:mousedown={handleMouseDown}
      on:mouseup={handleMouseUp}
    >
      <defs>
        <linearGradient
          id="waveformgrad"
          x1="0"
          y1="0"
          x2="1"
          y2="0"
          gradientUnits="objectBoundingBox"
        >
          <stop offset="0%" stop-color="blue" />
          <stop offset={playOffset()} stop-color="blue" />
          <stop offset={playOffset()} stop-color="yellow" />
          <stop offset="100%" stop-color="yellow" />
        </linearGradient>
      </defs>
      <path
        ref={svgPathRef}
        class="stroke-1 fill-none"
        stroke="url(#waveformgrad)"
      />
    </svg>
  );
}

export default Waveform;
