// Web Worker entry for Monaco's core editor worker. Importing this module sets
// up self.onmessage so Monaco can offload tokenization/diffing/link detection.
// Java only needs this base worker (there is no Java language worker), and a
// single getWorker returns it for every label. Keeping this in its own file lets
// the bundler emit a dedicated worker chunk instead of Monaco trying (and
// failing) to resolve worker URLs on its own, which caused unhandled rejections.
import "monaco-editor/editor/editor.worker.js";
