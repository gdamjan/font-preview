# Font Preview

A static, client-side web page for previewing OpenType and TrueType fonts. Drop a font file and instantly see it rendered on a canvas — no server required.

## Features

- **Drag & drop** (or click to browse) for `.ttf`, `.otf`, `.woff`, `.woff2` files
- **Canvas rendering** of characters with configurable font size and color
- **Character presets:**
  - Cyrillic MK (`б в г д ѓ п т з к ѐ ѝ`) — with OpenType `locl` feature enabled
  - Full Cyrillic (U+0400–U+04FF)
  - Latin ASCII, uppercase, lowercase, digits, punctuation, extended Latin
  - Custom text input
- **OpenType `locl` (localized forms)** for Macedonian, rendered via SVG foreignObject to activate the browser's text shaper with `lang="mk"` and `font-feature-settings: 'locl'`
- **Font metadata** parsed from the binary:
  - Family name (from the `name` table, nameID 1)
  - Version string (nameID 5)
  - Italic flag (from `OS/2` fsSelection or `head` macStyle)

## Usage

Open `index.html` in any modern browser. No build step or server needed.

```sh
# or simply double-click index.html
xdg-open index.html
```

## How it works

1. The dropped font file is read as an `ArrayBuffer`
2. Font metadata is parsed directly from the binary (table directory, `name`, `OS/2`, `head` tables)
3. The font is registered via the [CSS Font Loading API](https://developer.mozilla.org/en-US/docs/Web/API/FontFace) (`FontFace`)
4. Characters are rendered on a `<canvas>` using `fillText`
5. For Macedonian localized forms, an SVG `foreignObject` pipeline is used — the font is embedded as base64 in an `@font-face` rule inside the SVG, with `lang="mk"` and `font-feature-settings: 'locl'` on the text element

## Browser support

Works in all modern browsers (Chrome, Firefox, Safari, Edge). Requires support for:
- `FontFace` API
- `DataView` / `ArrayBuffer`
- SVG `foreignObject` (for `locl` rendering)
