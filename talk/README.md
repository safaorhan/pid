# PID | Robotlar Nasıl Ayakta Durur

Open `index.html` in Chrome. It works offline, straight from the file.

| Key | Action |
|---|---|
| → / Space / PageDown | next (reveals bullets first) |
| ← / PageUp | back |
| N | speaker notes + timer |
| T | reset timer |
| F | fullscreen |
| W / S | drive the twin on the beep slide |

Click a robot twin to nudge it (left half / right half).

## Editing the text

Press **E** for edit mode. Every text becomes editable in place: headings, bullets,
captions, code blocks and speaker notes (open them with N). Buttons and diagram
labels open a small input box when clicked. Labels drawn inside the simulations
are in the "Simülasyon etiketleri" tab at the top right.

Press **⌘S** to save. The first time, Chrome asks for a folder: pick this `talk`
folder and allow editing. Chrome remembers it (after a reload it may ask once more to
allow editing). Each save first copies the previous version to `index.backup.html`.

- The first save rewrites the file in the browser's own HTML style (e.g. `<path/>`
  becomes `<path></path>`). Later saves only change what you edited.
- If you also edit `index.html` in a text editor, reload the page before saving
  from the browser. Otherwise it refuses, rather than overwriting your editor changes.
- If saving doesn't work when the file is opened directly, serve the folder instead:
  `python3 -m http.server 8765` in this folder, then open http://127.0.0.1:8765.

## Live demos

Load these into code.pybricks.com beforehand, together with `PID.py`:

| Slide | File |
|---|---|
| 9 · Adım 1 | `../checkpoints/step1_p.py` |
| 10 · Adım 2 | `../checkpoints/step2_pd.py` |
| 11 · Adım 3 | `../checkpoints/step3_pid_tuning.py` (needs the Xbox controller) |
| 14 · Adım 4 | `../checkpoints/step4_cascade.py` (needs the Xbox controller) |
| 15 · Adım 5 | `../checkpoints/step5_xbox.py` (same as `selfbalancing_final.py`) |

Step files 1–4 have not been run on the robot yet. Rehearse each one and update
the slide captions (notes marked "PROVA SONRASI") to match what the robot really does.

## Robot twin

`sims.js` models the robot as an inverted pendulum on wheels, using the real gains,
whole-degree `tilt()` readings and the `wait(10)` loop timing. Its body height, motor
response and sensor offset are estimates, not measurements, so treat it as an
illustration, not a prediction.
