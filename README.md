# Audaciously

This project was done using [Vue 3](https://vuejs.org/) (Composition API) and
[Tailwind CSS 4](https://tailwindcss.com/) (using [Daisy UI v5](https://v5.daisyui.com/)).

The goal is to reproduce [Audacity](https://www.audacityteam.org/), or similar audio
recording project, in the browser.

## What's implemented?

- Master volume with 2x volume boost
- Recording from default microphone
- Playback (seeking, pause, resume, stop, etc.)
- Audio tools (split, move, cut)
- Using Web Workers for background processing

## What's not completed?

- Audio filters (fading, balance, equaliser, normalise, pitch, noise cancelling, etc.)
- Changing playback speek per audio sequence
- Saving and loading projects
- Exporting project to other formats
- Scrolling and zooming improvements

## Bugs?

- Recording while playing sound affect recording quality
- Updating sequences (e.g. splitting a sequence) does not update the track correctly
