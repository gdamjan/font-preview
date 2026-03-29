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

let loadedFontFamily = null;
let loadedFontBuffer = null;
let loadedCodepoints = new Set();
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

  // Parse cmap table to get supported codepoints
  const supportedCodepoints = new Set();
  if (tables['cmap']) {
    const cmapOff = tables['cmap'].offset;
    const numSubtables = view.getUint16(cmapOff + 2);

    for (let i = 0; i < numSubtables; i++) {
      const subOff = cmapOff + 4 + i * 8;
      const platformID = view.getUint16(subOff);
      const encodingID = view.getUint16(subOff + 2);
      const subtableOffset = cmapOff + view.getUint32(subOff + 4);
      const format = view.getUint16(subtableOffset);

      // Format 4: Segment mapping to delta values (BMP)
      if (format === 4 && ((platformID === 3 && encodingID === 1) || (platformID === 0))) {
        const segCount = view.getUint16(subtableOffset + 6) / 2;
        const endCodesOff = subtableOffset + 14;
        const startCodesOff = endCodesOff + segCount * 2 + 2;
        const idDeltaOff = startCodesOff + segCount * 2;
        const idRangeOff = idDeltaOff + segCount * 2;

        for (let s = 0; s < segCount; s++) {
          const endCode = view.getUint16(endCodesOff + s * 2);
          const startCode = view.getUint16(startCodesOff + s * 2);
          const idDelta = view.getInt16(idDeltaOff + s * 2);
          const idRangeOffset = view.getUint16(idRangeOff + s * 2);

          if (startCode === 0xFFFF) break;

          for (let c = startCode; c <= endCode; c++) {
            let glyphIndex;
            if (idRangeOffset === 0) {
              glyphIndex = (c + idDelta) & 0xFFFF;
            } else {
              const rangeAddr = idRangeOff + s * 2 + idRangeOffset + (c - startCode) * 2;
              glyphIndex = view.getUint16(rangeAddr);
              if (glyphIndex !== 0) glyphIndex = (glyphIndex + idDelta) & 0xFFFF;
            }
            if (glyphIndex !== 0) supportedCodepoints.add(c);
          }
        }
        if (supportedCodepoints.size > 0) break;
      }

      // Format 12: Segmented coverage (full Unicode)
      if (format === 12) {
        const numGroups = view.getUint32(subtableOffset + 12);
        const groupsOff = subtableOffset + 16;
        for (let g = 0; g < numGroups; g++) {
          const startCharCode = view.getUint32(groupsOff + g * 12);
          const endCharCode = view.getUint32(groupsOff + g * 12 + 4);
          const startGlyphID = view.getUint32(groupsOff + g * 12 + 8);
          for (let c = startCharCode; c <= endCharCode; c++) {
            const glyphID = startGlyphID + (c - startCharCode);
            if (glyphID !== 0) supportedCodepoints.add(c);
          }
        }
        if (supportedCodepoints.size > 0) break;
      }
    }
  }

  return { italic, familyName, version, supportedCodepoints };
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
  loadedCodepoints = meta.supportedCodepoints;

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
  const chars = [...getChars()];
  const padding = 20;
  const lineHeight = fontSize * 1.4;
  const maxWidth = 760;

  ctx.font = `${fontSize}px "${loadedFontFamily}"`;

  // Break into lines of {char, supported} objects
  const lines = [[]];
  let lineWidth = 0;
  for (const ch of chars) {
    const w = ctx.measureText(ch).width;
    if (lineWidth + w > maxWidth - padding * 2 && lines[lines.length - 1].length > 0) {
      lines.push([]);
      lineWidth = 0;
    }
    const supported = loadedCodepoints.size === 0 || loadedCodepoints.has(ch.codePointAt(0));
    lines[lines.length - 1].push({ ch, supported });
    lineWidth += w;
  }

  const canvasHeight = Math.ceil(padding * 2 + lines.length * lineHeight);
  const canvasWidth = maxWidth;

  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  ctx.font = `${fontSize}px "${loadedFontFamily}"`;
  ctx.textBaseline = 'top';

  lines.forEach((line, i) => {
    let x = padding;
    const y = padding + i * lineHeight;
    for (const { ch, supported } of line) {
      ctx.fillStyle = supported ? '#000000' : '#e74c3c';
      ctx.fillText(ch, x, y);
      x += ctx.measureText(ch).width;
    }
  });
}

// Render via SVG foreignObject to enable OpenType locl feature
async function renderWithLocl() {
  const fontSize = parseInt(fontSizeInput.value) || 48;
  const chars = [...getChars()];
  const padding = 20;
  const lineHeight = fontSize * 1.5;
  const canvasWidth = 760;
  // Estimate height generously; we use a single block of text with word-wrap
  const estimatedLines = Math.ceil(chars.length / Math.floor((canvasWidth - padding * 2) / (fontSize * 0.7))) + 1;
  const canvasHeight = Math.ceil(padding * 2 + estimatedLines * lineHeight);

  const base64Font = arrayBufferToBase64(loadedFontBuffer);
  const dataUrl = `data:font/opentype;base64,${base64Font}`;

  // Build HTML with per-character coloring for unsupported glyphs
  const spanChars = chars.map(ch => {
    const safe = ch.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const supported = loadedCodepoints.size === 0 || loadedCodepoints.has(ch.codePointAt(0));
    return supported ? safe : `<span style="color:#e74c3c">${safe}</span>`;
  }).join('');

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
            color: #000000;
            font-feature-settings: 'locl';
            padding: ${padding}px;
            background: white;
            width: ${canvasWidth}px;
            height: ${canvasHeight}px;
            box-sizing: border-box;
          ">${spanChars}</div>
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
charPresetSelect.addEventListener('change', () => {
  customLabel.style.display = charPresetSelect.value === 'custom' ? '' : 'none';
  render();
});
customCharsInput.addEventListener('input', render);
