# Audaciously — User Guide

**[Open the app →](https://mind2soft.github.io/audaciously/)**

v0.1.0 · browser-based · no install · no account

---

## Interface overview

The UI has three main areas:

```
┌──────────────────────────────────────────────────────┐
│  App Header (project name · export · settings · transport) │
├─────────────────┬────────────────────────────────────┤
│                 │  Node View (editor for selected node) │
│  Node Panel     ├────────────────────────────────────┤
│  (node tree)    │  Sequence Panel (timeline)          │
└─────────────────┴────────────────────────────────────┘
```

| Area                              | What it's for                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------ |
| **App Header**                    | Project name (click to rename), project browser, export, settings, play/pause/stop, status |
| **Node Panel** (left)             | Tree of all nodes in the project — add, rename, drag onto the timeline                     |
| **Node View** (top-right)         | Editor for the selected node: Piano Roll or Waveform editor                                |
| **Sequence Panel** (bottom-right) | Multi-track timeline — arrange segments in time                                            |

---

## Nodes

Nodes are the building blocks of a project. They live in the **Node Panel** on the left.

### Node types

| Type           | What it holds                      | Can place on timeline? |
| -------------- | ---------------------------------- | ---------------------- |
| **Folder**     | Groups other nodes                 | No                     |
| **Recorded**   | A captured audio buffer            | Yes                    |
| **Instrument** | Synthesised notes (piano or drums) | Yes                    |

### Managing nodes

- **Add a node** — use the add button at the top of the Node Panel; choose the type
- **Rename** — double-click a node name
- **Delete** — select the node, then use the delete action in the toolbar
- **Nest** — drag a node onto a Folder node to move it inside

---

## Recording audio

1. Go to **Settings** and confirm the correct input device (microphone) is selected.
2. Select or create a **Recorded** node.
3. Press the record button in the Node View to start capturing.
4. Press stop when done — the audio buffer is saved to the node automatically.

> Use headphones when recording with playback running. Echo cancellation is off by default for cleaner overdubs.

---

## Instrument nodes & the Piano Roll

Select an **Instrument** node to open the Piano Roll.

### Layout

- **Top** — timeline ruler + zoom slider
- **Middle** — the note grid (pitch rows × beats)
- **Bottom** — play/pause · note duration selector · editing tools

### Note duration selector

Sets the grid snap size for placing and selecting notes:

`Whole` · `Half` · `Quarter` · `Eighth` · `Sixteenth`

### Editing tools

| Icon | Tool      | What it does                                                                                                                    |
| ---- | --------- | ------------------------------------------------------------------------------------------------------------------------------- |
| ✏️   | **Place** | Click empty space to draw a note. Click an existing note to erase it. Default tool.                                             |
| ✋   | **Pan**   | Click a beat line and drag left/right to shift all notes after that point. Snaps to the longest note duration in the moved set. |
| 📋   | **Copy**  | Drag to select a beat range. Notes overlapping the range are highlighted. Release to copy them to the clipboard.                |
| ✂️   | **Cut**   | Drag to select a beat range. Release to remove those notes and close the gap — subsequent notes shift left.                     |
| 📌   | **Paste** | Click to place the clipboard at the cursor beat. Existing notes shift right to make room. Disabled when clipboard is empty.     |

### Clipboard

- Backed by `localStorage` — persists across page refreshes
- Shared across browser tabs open to the same app
- Cut and Copy both write to the same clipboard slot

### Playback

The play/pause button in the Piano Roll previews the instrument node in isolation, not the full mix.

---

## Sequence Panel (timeline)

The timeline arranges **segments** — instances of nodes placed in time across one or more **tracks**.

### Tracks

- **Add Track** — button at the bottom of the panel
- **Mute / Lock** — per-track toggles on the left edge of each lane
- **Reorder** — drag a track header up or down
- **Resize** — drag the bottom edge of a track to change its height

### Adding content

Drag any non-folder node from the Node Panel onto a track. A segment is created at the drop position.

The same node can appear multiple times on the timeline as separate segments — they all reference the same underlying audio.

### Working with segments

| Action     | How                        |
| ---------- | -------------------------- |
| Select     | Click the segment          |
| Move       | Drag the center handle     |
| Trim start | Drag the left edge handle  |
| Trim end   | Drag the right edge handle |

### Segment display

- Recorded nodes — mini waveform preview
- Instrument nodes — note bar preview

---

## Effects

Every Instrument and Recorded node has an effects chain, visible in the **Node Properties** panel when a node is selected.

| Effect       | What it does                                                     |
| ------------ | ---------------------------------------------------------------- |
| **Gain**     | Volume multiplier. 1.0 = unity. Values above 1.0 amplify.        |
| **Balance**  | Stereo pan. -1 = full left · 0 = centre · +1 = full right        |
| **Fade In**  | Linear ramp from silence over N seconds at the start of playback |
| **Fade Out** | Linear ramp to silence over N seconds at the end of playback     |

Effects can be toggled on/off individually. They apply in order during playback.

---

## Projects

### Auto-save

Every edit is persisted to **IndexedDB** automatically. There is no manual save — close the tab and reopen; your work is there.

### Project browser

Click the project browser button in the header to:

- Open a saved project
- Rename a project
- Delete a project
- See storage quota and current usage

### AWP files (export / import)

Projects can be exported as `.awp` files — a single compressed bundle containing all audio and note data.

- **Export** — opens the save dialog; produces a `.awp` file
- **Import** — drag a `.awp` file onto the app, or use the project browser import option

Use AWP files for backups or to share a project with someone else.

---

## Export (WAV / MP3)

1. Click the **Export** button in the App Header.
2. Choose **WAV** or **MP3**.
3. Click export — the full mix renders offline (no upload) and a download starts.

MP3 encoding runs via lamejs, entirely in-browser.

---

## Settings

Open **Settings** from the App Header.

| Setting               | What it controls                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------- |
| **Input device**      | Microphone used for recording                                                               |
| **Output device**     | Speakers or headphones for playback (device switch takes effect immediately in Chrome 110+) |
| **Echo cancellation** | On/off — off by default                                                                     |
| **Noise suppression** | On/off — off by default                                                                     |
| **Auto gain control** | On/off — off by default                                                                     |

Audio processing is off by default to preserve clean recordings. Turn them on if you're recording in a noisy environment without headphones.

---

## Browser compatibility

| Feature                 | Chrome  | Firefox | Safari |
| ----------------------- | ------- | ------- | ------ |
| Playback & recording    | ✅      | ✅      | ✅     |
| Full feature set        | ✅      | ✅      | ✅     |
| Output device selection | ✅ 110+ | ❌      | ❌     |
