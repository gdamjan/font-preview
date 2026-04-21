import { loadFont } from './load-font.js';
import { render } from './render.js';

const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const fontInfo = document.getElementById('font-info');
const controls = document.getElementById('controls');
const canvasWrap = document.getElementById('canvas-wrap');
const canvas = document.getElementById('preview');
const fontSizeInput = document.getElementById('font-size');
const charPresetSelect = document.getElementById('char-preset');
const customCharsInput = document.getElementById('custom-chars');
const customLabel = document.getElementById('custom-label');
const loclLangSelect = document.getElementById('locl-lang');
const copyBtn = document.getElementById('copy-btn');

let hb = null;
let fontBuffer = null;

// Initialize HarfBuzz WASM
const hbReady = createHarfBuzz().then(module => {
  hb = hbjs(module);
  console.log('HarfBuzz WASM ready:', hb.version_string());
});

const PRESETS = {
  latin: () => String.fromCharCode(...Array.from({length: 95}, (_, i) => i + 32)),
  upper: () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lower: () => 'abcdefghijklmnopqrstuvwxyz',
  digits: () => '0123456789',
  punctuation: () => '!@#$%^&*()_+-=[]{}|;:\'",.<>?/`~',
  extended: () => String.fromCharCode(...Array.from({length: 224}, (_, i) => i + 32)),
  'cyrillic-mk': () => 'б в г д ѓ п т з к ѐ ѝ',
  'cyrillic-all': () => String.fromCharCode(...Array.from({length: 256}, (_, i) => i + 0x0400)),
  custom: () => customCharsInput.value || 'Type something…',
};

function redraw() {
  if (!fontBuffer || !hb) return;
  render(hb, canvas, fontBuffer, {
    fontSize: parseInt(fontSizeInput.value) || 48,
    text: PRESETS[charPresetSelect.value](),
    loclValue: loclLangSelect.value,
  });
}

// Drag & drop
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('hover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('hover'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('hover');
  if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFile(fileInput.files[0]);
});

async function handleFile(file) {
  await hbReady;

  let meta;
  try {
    meta = await loadFont(hb, file);
  } catch (err) {
    fontInfo.textContent = `⚠️ ${err.message}`;
    return;
  }

  fontBuffer = meta.fontBuffer;

  // Populate the locl dropdown
  loclLangSelect.innerHTML = '<option value="">off</option>';
  for (const { script, lang } of meta.loclLangs) {
    const opt = document.createElement('option');
    opt.value = `${script}/${lang}`;
    opt.textContent = `${lang} (${script})`;
    loclLangSelect.appendChild(opt);
  }
  const mkdOption = [...loclLangSelect.options].find(o => o.value.includes('MKD'));
  if (mkdOption) mkdOption.selected = true;

  const hasLocl = meta.loclLangs.length > 0 ? 'Yes' : 'No';
  const sizeKB = (meta.fileSize / 1024).toFixed(1);
  fontInfo.innerHTML = `<strong>Loaded:</strong> ${file.name} (${sizeKB} KB) — Family: <em>${meta.familyName}</em> — Version: <em>${meta.version}</em> — locl: <em>${hasLocl}</em> — Engine: <em>HarfBuzz WASM ${hb.version_string()}</em>`;
  controls.style.display = 'flex';
  canvasWrap.style.display = 'block';

  redraw();
}

// Re-render on control changes
fontSizeInput.addEventListener('input', redraw);
charPresetSelect.addEventListener('change', () => {
  customLabel.style.display = charPresetSelect.value === 'custom' ? '' : 'none';
  redraw();
});
customCharsInput.addEventListener('input', redraw);
loclLangSelect.addEventListener('change', redraw);
copyBtn.addEventListener('click', async () => {
  try {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    copyBtn.textContent = '✓ Copied';
    copyBtn.classList.add('copied');
    setTimeout(() => { copyBtn.textContent = '📋 Copy'; copyBtn.classList.remove('copied'); }, 1500);
  } catch (err) {
    console.error('Copy failed:', err);
    copyBtn.textContent = '⚠ Failed';
    setTimeout(() => { copyBtn.textContent = '📋 Copy'; }, 1500);
  }
});
