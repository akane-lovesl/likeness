# Vendored

Third-party files the app loads at run time. They are kept here so that the showcase edition works from a plain folder, with no network.

| Path | What | From | Licence |
|---|---|---|---|
| `mediapipe/vision_bundle.mjs`, `mediapipe/wasm/*` | MediaPipe Tasks Vision 1.2.3: the JavaScript bundle and its WebAssembly runtime | npm `@mediapipe/tasks-vision@1.2.3` | Apache 2.0 |
| `mediapipe/magic_touch.tflite` | Interactive segmenter (MagicTouch), float32: the model behind tap-to-select on a picture | `storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/latest/` | Apache 2.0 |
| `mediapipe/face_landmarker.task` | Face landmarker, float16: 478 points on a face, from which the mirror finds the parts a look can change | `storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/` | Apache 2.0 |
| `mediapipe/hair_segmenter.tflite` | Hair segmenter, float32: the hair in a portrait, for a change of colour | `storage.googleapis.com/mediapipe-models/image_segmenter/hair_segmenter/float32/latest/` | Apache 2.0 |
| `../fonts/fraunces*.woff2` | Fraunces variable, roman and italic, Latin | npm `@fontsource-variable/fraunces@5.3.0` | SIL Open Font License 1.1 |
| `../fonts/plex-mono-*.woff2` | IBM Plex Mono 400 and 500, Latin | npm `@fontsource/ibm-plex-mono@5.3.0` | SIL Open Font License 1.1 |
| `../fonts/pinyon-script.woff2`, `space-grotesk.woff2`, `courier-prime*.woff2`, `cinzel.woff2`, `instrument-serif*.woff2`, `vt323.woff2`, `caveat.woff2` | The rooms' typefaces: Pinyon Script, Space Grotesk, Courier Prime (regular and bold), Cinzel, Instrument Serif (roman and italic), VT323, Caveat | github.com/google/fonts (`ofl/`), converted from TTF to WOFF2 | SIL Open Font License 1.1 |

One change was made to the bundle: the `//# sourceMappingURL` comment at the end of `vision_bundle.mjs` was removed, because the map is not shipped and browsers report the missing file. Nothing else is modified.

MediaPipe is used in `web/js/studio/segment.js`, to select the part of a picture you tap, and in `web/js/studio/face.js`, to read a face in the mirror (its points, and its hair). It runs on the device and never sends a picture anywhere.
