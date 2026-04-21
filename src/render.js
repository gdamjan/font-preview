/** @import { HarfBuzz } from './types.js' */

/**
 * Shape text with HarfBuzz and render glyph outlines on a canvas.
 *
 * Creates HarfBuzz shaping objects from the font buffer, shapes the input text
 * (optionally applying the OpenType `locl` feature for a specific script/language),
 * then draws each glyph outline on the canvas using `Path2D`.
 *
 * Glyph paths are extracted in font units via `font.glyphToPath()` and rendered
 * with a coordinate transform that scales from font units (upem) to pixels and
 * flips the Y axis (font coordinates point up, canvas coordinates point down).
 *
 * Lines are wrapped automatically to fit within a 760 px canvas width.
 *
 * @param {HarfBuzz} hb - Initialized harfbuzzjs instance (the object returned by `hbjs(module)`).
 * @param {HTMLCanvasElement} canvas - The canvas element to draw on.
 *   Its width and height are set automatically based on the shaped output.
 * @param {Uint8Array} fontBuffer - Raw font file bytes (the same buffer returned
 *   by {@link loadFont}).
 * @param {object} options
 * @param {number} options.fontSize - Desired font size in pixels.
 * @param {string} options.text - The text string to shape and render.
 * @param {string} options.loclValue - A `"script/lang"` string (e.g. `"cyrl/MKD"`)
 *   to activate the `locl` feature, or an empty string to let HarfBuzz guess
 *   segment properties automatically.
 */
export function render(hb, canvas, fontBuffer, { fontSize, text, loclValue }) {
  const ctx = canvas.getContext('2d');
  const padding = 20;
  const maxWidth = 760;

  const blob = hb.createBlob(fontBuffer);
  const face = hb.createFace(blob, 0);
  const font = hb.createFont(face);

  const upem = face.upem;
  const scale = fontSize / upem;

  // Get font vertical metrics for baseline positioning
  const extents = font.hExtents();
  const ascender = extents.ascender * scale;

  // Shape the text
  const buffer = hb.createBuffer();
  buffer.addText(text);
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
      const dx = (g.dx || 0) * scale;
      const dy = (g.dy || 0) * scale;

      const svgPath = font.glyphToPath(g.g);
      if (svgPath) {
        const path = new Path2D(svgPath);
        ctx.save();
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
