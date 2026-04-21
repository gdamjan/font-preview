const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, 'dist');
const HB = path.join(__dirname, 'node_modules', 'harfbuzzjs');

// Clean and create dist/
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(path.join(DIST, 'lib'), { recursive: true });

// Copy app files
for (const file of ['index.html', 'app.js']) {
  fs.copyFileSync(path.join(__dirname, file), path.join(DIST, file));
}

// Copy HarfBuzz WASM runtime from node_modules
for (const file of ['hb.js', 'hbjs.js', 'hb.wasm']) {
  fs.copyFileSync(path.join(HB, file), path.join(DIST, 'lib', file));
}

const total = fs.readdirSync(DIST, { recursive: true })
  .filter(f => fs.statSync(path.join(DIST, f)).isFile());

console.log(`dist/ ready (${total.length} files):`);
total.forEach(f => {
  const size = fs.statSync(path.join(DIST, f)).size;
  console.log(`  ${f}  (${(size / 1024).toFixed(1)} KB)`);
});
