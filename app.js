const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const fontInfo = document.getElementById('font-info');
const controls = document.getElementById('controls');
const canvasWrap = document.getElementById('canvas-wrap');
const canvas = document.getElementById('preview');
const ctx = canvas.getContext('2d');
const fontSizeInput = document.getElementById('font-size');
const charPresetSelect = document.getElementById('char-preset');
const customCharsInput = document.getElementById('custom-chars');
const customLabel = document.getElementById('custom-label');
const loclLangSelect = document.getElementById('locl-lang');

let hb = null;
let loadedFontBuffer = null;
let fontCounter = 0;

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

function getChars() {
  return PRESETS[charPresetSelect.value]();
}

// Drag & drop
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('hover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('hover'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('hover');
  const file = e.dataTransfer.files[0];
  if (file) loadFont(file);
});
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) loadFont(fileInput.files[0]);
});

async function loadFont(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['ttf', 'otf', 'woff', 'woff2'].includes(ext)) {
    fontInfo.textContent = '⚠️ Unsupported file type. Please use .ttf, .otf, .woff, or .woff2';
    return;
  }

  await hbReady;

  const buffer = await file.arrayBuffer();
  loadedFontBuffer = new Uint8Array(buffer);

  // Use HarfBuzz to read font metadata
  const blob = hb.createBlob(loadedFontBuffer);
  const face = hb.createFace(blob, 0);
  const font = hb.createFont(face);

  const familyName = face.getName(1, 'en') || face.getName(1, '') || `CustomFont${++fontCounter}`;
  const version = face.getName(5, 'en') || face.getName(5, '') || 'Unknown';

  // Discover which script/language combinations have a 'locl' feature
  const loclLangs = [];
  const scripts = face.getTableScriptTags('GSUB');
  scripts.forEach((script, si) => {
    const langs = face.getScriptLanguageTags('GSUB', si);
    langs.forEach((lang, li) => {
      const features = face.getLanguageFeatureTags('GSUB', si, li);
      if (features.includes('locl')) {
        loclLangs.push({ script: script.trim(), lang: lang.trim() });
      }
    });
  });

  // Populate the locl dropdown
  loclLangSelect.innerHTML = '<option value="">off</option>';
  for (const { script, lang } of loclLangs) {
    const opt = document.createElement('option');
    opt.value = `${script}/${lang}`;
    opt.textContent = `${lang} (${script})`;
    loclLangSelect.appendChild(opt);
  }
  // Auto-select MKD if available
  const mkdOption = [...loclLangSelect.options].find(o => o.value.includes('MKD'));
  if (mkdOption) mkdOption.selected = true;

  const hasLocl = loclLangs.length > 0 ? 'Yes' : 'No';

  font.destroy();
  face.destroy();
  blob.destroy();

  const sizeKB = (file.size / 1024).toFixed(1);
  fontInfo.innerHTML = `<strong>Loaded:</strong> ${file.name} (${sizeKB} KB) — Family: <em>${familyName}</em> — Version: <em>${version}</em> — locl: <em>${hasLocl}</em> — Engine: <em>HarfBuzz WASM ${hb.version_string()}</em>`;
  controls.style.display = 'flex';
  canvasWrap.style.display = 'block';

  render();
}

function render() {
  if (!loadedFontBuffer || !hb) return;

  const fontSize = parseInt(fontSizeInput.value) || 48;
  const text = getChars();
  const padding = 20;
  const maxWidth = 760;

  const blob = hb.createBlob(loadedFontBuffer);
  const face = hb.createFace(blob, 0);
  const font = hb.createFont(face);

  const upem = face.upem;
  const scale = fontSize / upem;

  // Get font vertical metrics for baseline positioning
  const extents = font.hExtents();
  const ascender = extents.ascender * scale;

  // Determine script/language/features from the locl dropdown
  const buffer = hb.createBuffer();
  buffer.addText(text);
  const loclValue = loclLangSelect.value; // e.g. "cyrl/MKD" or ""
  let features = '';
  if (loclValue) {
    const [script, lang] = loclValue.split('/');
    buffer.setScript(script);
    buffer.setLanguage(lang);
    buffer.setDirection('ltr');
    features = 'locl';
  } else {
    buffer.guessSegmentProperties();
  }

  hb.shape(font, buffer, features);

  const glyphs = buffer.json();

  // Line-break: split glyphs into lines that fit within maxWidth
  const contentWidth = maxWidth - padding * 2;
  const lines = [[]];
  let lineWidth = 0;
  for (const g of glyphs) {
    const advance = g.ax * scale;
    if (lineWidth + advance > contentWidth && lines[lines.length - 1].length > 0) {
      lines.push([]);
      lineWidth = 0;
    }
    lines[lines.length - 1].push(g);
    lineWidth += advance;
  }

  const lineHeight = fontSize * 1.4;
  const canvasHeight = Math.ceil(padding * 2 + lines.length * lineHeight);

  canvas.width = maxWidth;
  canvas.height = canvasHeight;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, maxWidth, canvasHeight);
  ctx.fillStyle = '#000000';

  // Render each glyph using Path2D from HarfBuzz SVG path data
  for (let li = 0; li < lines.length; li++) {
    let xCursor = padding;
    const yBaseline = padding + ascender + li * lineHeight;

    for (const g of lines[li]) {
      const glyphId = g.g;
      const dx = (g.dx || 0) * scale;
      const dy = (g.dy || 0) * scale;

      const svgPath = font.glyphToPath(glyphId);
      if (svgPath) {
        const path = new Path2D(svgPath);
        ctx.save();
        // Position at glyph origin, scale from font units to pixels, flip Y
        ctx.translate(xCursor + dx, yBaseline - dy);
        ctx.scale(scale, -scale);
        ctx.fill(path);
        ctx.restore();
      }

      xCursor += g.ax * scale;
    }
  }

  buffer.destroy();
  font.destroy();
  face.destroy();
  blob.destroy();
}

// Re-render on control changes
fontSizeInput.addEventListener('input', render);
charPresetSelect.addEventListener('change', () => {
  customLabel.style.display = charPresetSelect.value === 'custom' ? '' : 'none';
  render();
});
customCharsInput.addEventListener('input', render);
loclLangSelect.addEventListener('change', render);
