const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const fontInfo = document.getElementById('font-info');
const controls = document.getElementById('controls');
const canvasWrap = document.getElementById('canvas-wrap');
const canvas = document.getElementById('preview');
const ctx = canvas.getContext('2d');
const fontSizeInput = document.getElementById('font-size');
const fontColorSelect = document.getElementById('font-color');
const charPresetSelect = document.getElementById('char-preset');
const customCharsInput = document.getElementById('custom-chars');
const customLabel = document.getElementById('custom-label');

let loadedFontFamily = null;
let loadedFontBuffer = null;
let fontCounter = 0;

const PRESETS = {
  latin: () => String.fromCharCode(...Array.from({length: 95}, (_, i) => i + 32)),
  upper: () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lower: () => 'abcdefghijklmnopqrstuvwxyz',
  digits: () => '0123456789',
  punctuation: () => '!@#$%^&*()_+-=[]{}|;:\'",.<>?/`~',
  extended: () => String.fromCharCode(...Array.from({length: 224}, (_, i) => i + 32)),
  'cyrillic-mk': () => 'б в г д ѓ п т з к ѐ ѝ',
  // Cyrillic block U+0400–U+04FF
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

// Parse basic font metadata from the binary
function parseFontMeta(buffer) {
  const view = new DataView(buffer);
  const numTables = view.getUint16(4);
  const tables = {};
  for (let i = 0; i < numTables; i++) {
    const offset = 12 + i * 16;
    const tag = String.fromCharCode(
      view.getUint8(offset), view.getUint8(offset+1),
      view.getUint8(offset+2), view.getUint8(offset+3)
    );
    tables[tag] = {
      offset: view.getUint32(offset + 8),
      length: view.getUint32(offset + 12),
    };
  }

  let italic = null;
  // OS/2 table: fsSelection at byte offset 62, bit 0 = ITALIC
  if (tables['OS/2'] && tables['OS/2'].length > 63) {
    const fsSelection = view.getUint16(tables['OS/2'].offset + 62);
    italic = !!(fsSelection & 0x0001);
  }
  // Fallback: head table macStyle at byte offset 44, bit 1 = ITALIC
  if (italic === null && tables['head'] && tables['head'].length > 45) {
    const macStyle = view.getUint16(tables['head'].offset + 44);
    italic = !!(macStyle & 0x0002);
  }

  // Parse family name (nameID 1) and version (nameID 5) from the name table
  let familyName = null;
  let version = null;
  if (tables['name']) {
    const nameOff = tables['name'].offset;
    const nameCount = view.getUint16(nameOff + 2);
    const stringOffset = nameOff + view.getUint16(nameOff + 4);

    for (let i = 0; i < nameCount; i++) {
      const recOff = nameOff + 6 + i * 12;
      const platformID = view.getUint16(recOff);
      const encodingID = view.getUint16(recOff + 2);
      const nameID = view.getUint16(recOff + 6);
      const length = view.getUint16(recOff + 8);
      const offset = view.getUint16(recOff + 10);

      if (nameID !== 1 && nameID !== 5) continue;

      const strStart = stringOffset + offset;
      let decoded = null;
      // Platform 3 (Windows), encoding 1 (Unicode BMP) — UTF-16BE
      if (platformID === 3 && encodingID === 1) {
        decoded = '';
        for (let j = 0; j < length; j += 2) {
          decoded += String.fromCharCode(view.getUint16(strStart + j));
        }
      }
      // Platform 1 (Mac), encoding 0 (Roman) — single-byte
      if (platformID === 1 && encodingID === 0 && decoded === null) {
        decoded = '';
        for (let j = 0; j < length; j++) {
          decoded += String.fromCharCode(view.getUint8(strStart + j));
        }
      }

      if (decoded !== null) {
        if (nameID === 1 && !familyName) familyName = decoded;
        if (nameID === 5 && !version) version = decoded;
      }
      if (familyName && version) break;
    }
  }

  return { italic, familyName, version };
}

async function loadFont(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['ttf', 'otf', 'woff', 'woff2'].includes(ext)) {
    fontInfo.textContent = '⚠️ Unsupported file type. Please use .ttf, .otf, .woff, or .woff2';
    return;
  }

  const buffer = await file.arrayBuffer();
  const meta = parseFontMeta(buffer);
  const familyName = meta.familyName || `CustomFont${++fontCounter}`;

  const face = new FontFace(familyName, buffer);
  try {
    await face.load();
  } catch (err) {
    fontInfo.textContent = `⚠️ Failed to load font: ${err.message}`;
    return;
  }

  document.fonts.add(face);
  loadedFontFamily = familyName;
  loadedFontBuffer = buffer;

  const sizeKB = (file.size / 1024).toFixed(1);
  const italicLabel = meta.italic === null ? 'Unknown' : (meta.italic ? 'Yes' : 'No');
  const versionLabel = meta.version || 'Unknown';
  fontInfo.innerHTML = `<strong>Loaded:</strong> ${file.name} (${sizeKB} KB) — Family: <em>${familyName}</em> — Version: <em>${versionLabel}</em> — Italic: <em>${italicLabel}</em>`;
  controls.style.display = 'flex';
  canvasWrap.style.display = 'block';

  render();
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function render() {
  if (!loadedFontFamily) return;

  const preset = charPresetSelect.value;
  const useLocl = preset === 'cyrillic-mk';

  if (useLocl) {
    renderWithLocl();
  } else {
    renderSimple();
  }
}

function renderSimple() {
  const fontSize = parseInt(fontSizeInput.value) || 48;
  const color = fontColorSelect.value;
  const chars = getChars();
  const padding = 20;
  const lineHeight = fontSize * 1.4;
  const maxWidth = 760;

  ctx.font = `${fontSize}px "${loadedFontFamily}"`;

  const lines = [];
  let currentLine = '';
  for (const ch of chars) {
    const test = currentLine + ch;
    const w = ctx.measureText(test).width;
    if (w > maxWidth - padding * 2 && currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = ch;
    } else {
      currentLine = test;
    }
  }
  if (currentLine) lines.push(currentLine);

  const canvasHeight = Math.ceil(padding * 2 + lines.length * lineHeight);
  const canvasWidth = maxWidth;

  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  ctx.font = `${fontSize}px "${loadedFontFamily}"`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';

  lines.forEach((line, i) => {
    ctx.fillText(line, padding, padding + i * lineHeight);
  });
}

// Render via SVG foreignObject to enable OpenType locl feature
async function renderWithLocl() {
  const fontSize = parseInt(fontSizeInput.value) || 48;
  const color = fontColorSelect.value;
  const chars = getChars();
  const padding = 20;
  const lineHeight = fontSize * 1.5;
  const canvasWidth = 760;
  // Estimate height generously; we use a single block of text with word-wrap
  const estimatedLines = Math.ceil(chars.length / Math.floor((canvasWidth - padding * 2) / (fontSize * 0.7))) + 1;
  const canvasHeight = Math.ceil(padding * 2 + estimatedLines * lineHeight);

  const base64Font = arrayBufferToBase64(loadedFontBuffer);
  const dataUrl = `data:font/opentype;base64,${base64Font}`;

  // Escape special XML characters in the text
  const safeChars = chars
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const svgMarkup = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}">
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml">
          <style>
            @font-face {
              font-family: 'LoclFont';
              src: url('${dataUrl}');
            }
          </style>
          <div lang="mk" style="
            font-family: 'LoclFont';
            font-size: ${fontSize}px;
            line-height: ${lineHeight}px;
            color: ${color};
            font-feature-settings: 'locl';
            padding: ${padding}px;
            background: white;
            width: ${canvasWidth}px;
            height: ${canvasHeight}px;
            box-sizing: border-box;
          ">${safeChars}</div>
        </div>
      </foreignObject>
    </svg>`;

  const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const img = new Image();
  img.onload = () => {
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
  };
  img.onerror = () => {
    console.error('SVG foreignObject rendering failed');
    URL.revokeObjectURL(url);
    // Fall back to simple rendering
    renderSimple();
  };
  img.src = url;
}

// Re-render on control changes
fontSizeInput.addEventListener('input', render);
fontColorSelect.addEventListener('change', render);
charPresetSelect.addEventListener('change', () => {
  customLabel.style.display = charPresetSelect.value === 'custom' ? '' : 'none';
  render();
});
customCharsInput.addEventListener('input', render);
