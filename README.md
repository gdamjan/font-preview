# Font Preview

A static, client-side web page for previewing OpenType and TrueType fonts.
Drop a font file and see it rendered on a canvas using **HarfBuzz WASM** for text shaping.

## Features

- **Drag & drop** (or click to browse) for `.ttf`, `.otf`, `.woff`, `.woff2` files
- **HarfBuzz WASM** for text shaping — glyph outlines are rendered directly via Canvas `Path2D`, bypassing the browser's text engine entirely
- **OpenType feature support** — `locl` (localized forms) for Macedonian Cyrillic is activated through HarfBuzz's shaper, not CSS hacks
- **Character presets:**
  - Cyrillic MK (`б в г д ѓ п т з к ѐ ѝ`) — shaped with `script=Cyrl`, `language=mk`, `locl` feature
  - Full Cyrillic (U+0400–U+04FF)
  - Latin ASCII, uppercase, lowercase, digits, punctuation, extended Latin
  - Custom text input
- **Font metadata** read via HarfBuzz from the `name` table (family name, version) and GSUB feature tags

## Usage

```sh
pnpm install
pnpm build       # creates dist/
pnpm serve       # serve dist/ locally
# or: pnpm start (builds then serves)
```

## How it works

1. The dropped font file is read as an `ArrayBuffer`
2. **HarfBuzz WASM** (`harfbuzzjs`) loads the font binary into a `Blob → Face → Font`
3. Text is shaped with `hb.shape(font, buffer, features)` — HarfBuzz performs glyph substitution (GSUB) and positioning (GPOS)
4. For each shaped glyph, the outline is extracted as an SVG path string via `font.glyphToPath(glyphId)`
5. Paths are drawn on a `<canvas>` using `Path2D`, with proper coordinate transforms (font units → pixels, Y-axis flip)

## Browser support

Works in all modern browsers (Chrome, Firefox, Safari, Edge). Requires support for:

- WebAssembly
- Canvas `Path2D` with SVG path data
- `DataView` / `ArrayBuffer`
