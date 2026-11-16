// Serve the OCR worker, engine and English data with the app instead of a third-party script CDN.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'public/assets/food-reader');
fs.mkdirSync(output, { recursive: true });
const copy = (source, name) => fs.copyFileSync(path.join(root, 'node_modules', source), path.join(output, name));
copy('tesseract.js/dist/worker.min.js', 'worker.min.js');
for (const variant of ['', '-simd', '-relaxedsimd']) {
  const name = `tesseract-core${variant}-lstm.wasm.js`;
  copy(`tesseract.js-core/${name}`, name);
}
copy('@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'eng.traineddata.gz');
copy('tesseract.js/LICENSE.md', 'TESSERACT-LICENSE.txt');
copy('tesseract.js-core/LICENSE', 'TESSERACT-CORE-LICENSE.txt');
