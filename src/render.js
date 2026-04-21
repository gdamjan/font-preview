/**
 * Shape text with HarfBuzz and render glyph outlines on a canvas.
 * @param {object} hb - harfbuzzjs instance
 * @param {HTMLCanvasElement} canvas
 * @param {Uint8Array} fontBuffer
 * @param {{ fontSize: number, text: string, loclValue: string }} options
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
