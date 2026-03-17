# Roadmap

Audaciously is v0.0.3 — a working experiment, not a finished tool. The directions below are being actively explored, not promised.

---

## Sequence editing

**Paste modes** — the current paste behaviour always shifts notes right. Three additional modes are being designed:

| Mode           | Behaviour                                                           |
| -------------- | ------------------------------------------------------------------- |
| **Splice**     | Insert audio and shift only the current track's content right       |
| **Splice all** | Insert audio and shift all tracks simultaneously (keeps alignment)  |
| **Fill**       | Place audio only into silences; skip over anything already there    |
| **Overwrite**  | Drop audio in place, truncating or replacing whatever is underneath |

These affect both the Piano Roll and the Sequence Panel.

---

## Audio processing

- **Equaliser** — per-node frequency shaping
- **Normalise** — peak or RMS normalisation of recorded audio
- **Pitch shift** — time-independent pitch adjustment
- **Noise reduction** — subtract a noise profile from a recorded node
- **speed** — change playback speed

Define other effects like echo, voice recording optimization effects, etc.

---

## Tracks and sequences

Complete overhaul of what tracks and sequences are:

- a **track** contains **sequences**
- a **sequence** plays an audio **node**, either in part of completely

---

## Audio Nodes

Currently: **recorded** and **instrument**. Will add:

- **project** will play a referenced project rendered audio (source=project id, target=project rendering)
- **URL** will dynamically load the content of a URL (must be audio type) (source=url, target=content audio buffer)

---

## Instruments

The node architecture is designed to support additional synth types. What gets added depends on what's interesting to build and what the Web Audio API can do without external libraries.

---

## WebAssembly

Explore using WebAssembly for processing data instead of JavaScript.

---

## Not planned

- A server or backend of any kind
- User accounts
- Plugin system (VST / AU / etc.)

The constraint of running entirely in the browser is intentional, not a temporary limitation.
