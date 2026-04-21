/**
 * JSDoc type definitions for the harfbuzzjs CJS API (v0.10.3).
 *
 * The published npm package does not ship TypeScript declarations.
 * These typedefs are derived from the upstream source at
 * {@link https://github.com/harfbuzz/harfbuzzjs} and cover the subset
 * of the API used in this project.
 *
 * @module types
 */

// ── Shared data shapes ──────────────────────────────────────────────

/**
 * @typedef {object} FontExtents
 * @property {number} ascender  - Typographic ascender in font units.
 * @property {number} descender - Typographic descender in font units (typically negative).
 * @property {number} lineGap   - Line gap in font units.
 */

/**
 * @typedef {object} GlyphExtents
 * @property {number} xBearing - Left side bearing.
 * @property {number} yBearing - Top side bearing.
 * @property {number} width    - Glyph width.
 * @property {number} height   - Glyph height (typically negative).
 */

/**
 * A single glyph entry returned by {@link HBBuffer.json}.
 *
 * @typedef {object} JsonGlyph
 * @property {number} g  - Glyph ID.
 * @property {number} cl - Cluster index.
 * @property {number} ax - Advance width (horizontal).
 * @property {number} ay - Advance height (vertical).
 * @property {number} dx - X displacement.
 * @property {number} dy - Y displacement.
 * @property {number} fl - Glyph flags.
 */

// ── HarfBuzz wrapper objects ────────────────────────────────────────

/**
 * A blob wraps a chunk of binary data (typically the contents of a font file).
 *
 * @typedef {object} HBBlob
 * @property {number} ptr - Internal WASM pointer.
 * @property {() => void} destroy - Free the blob and its backing memory.
 */

/**
 * A face represents a single typeface in a font file.
 *
 * @typedef {object} HBFace
 * @property {number} ptr  - Internal WASM pointer.
 * @property {number} upem - Units per em of the face.
 * @property {(table: string) => Uint8Array | undefined} reference_table
 *   Return the binary contents of an OpenType table.
 * @property {() => Record<string, {min: number, default: number, max: number}>} getAxisInfos
 *   Return variation axis infos.
 * @property {() => Uint32Array} collectUnicodes
 *   Return all Unicode code points supported by the face.
 * @property {(table: string) => string[]} getTableScriptTags
 *   Return script tags in a GSUB or GPOS table.
 * @property {(table: string) => string[]} getTableFeatureTags
 *   Return feature tags in a GSUB or GPOS table.
 * @property {(table: string, scriptIndex: number) => string[]} getScriptLanguageTags
 *   Return language tags under a script index.
 * @property {(table: string, scriptIndex: number, languageIndex: number) => string[]} getLanguageFeatureTags
 *   Return feature tags under a specific script and language.
 * @property {(glyph: number) => string} getGlyphClass
 *   Return the GDEF class of a glyph (e.g. "BASE_GLYPH", "MARK").
 * @property {() => Array<{nameId: number, language: string}>} listNames
 *   Return all entries from the name table.
 * @property {(nameId: number, language: string) => string} getName
 *   Return a name table entry by ID and language.
 * @property {() => void} destroy - Free the face.
 */

/**
 * A font represents a face at a specific size / variation configuration.
 *
 * @typedef {object} HBFont
 * @property {number} ptr - Internal WASM pointer.
 * @property {() => HBFont} subFont - Create a sub font.
 * @property {() => FontExtents} hExtents - Return horizontal extents.
 * @property {() => FontExtents} vExtents - Return vertical extents.
 * @property {(glyphId: number) => string} glyphName
 *   Return the name of a glyph.
 * @property {(glyphId: number) => string} glyphToPath
 *   Return a glyph outline as an SVG path data string.
 * @property {(glyphId: number) => number} glyphHAdvance
 *   Return horizontal advance width.
 * @property {(glyphId: number) => number} glyphVAdvance
 *   Return vertical advance height.
 * @property {(glyphId: number) => GlyphExtents | null} glyphExtents
 *   Return glyph extents, or null if unavailable.
 * @property {(xScale: number, yScale: number) => void} setScale
 *   Set the font scale factor.
 * @property {(variations: Record<string, number>) => void} setVariations
 *   Set font variations (e.g. `{ wght: 700 }`).
 * @property {() => void} destroy - Free the font.
 */

/**
 * A buffer holds text before shaping and glyph results after shaping.
 *
 * @typedef {object} HBBuffer
 * @property {number} ptr - Internal WASM pointer.
 * @property {(text: string) => void} addText
 *   Add a UTF-16 text string to the buffer.
 * @property {(codePoints: number[]) => void} addCodePoints
 *   Add an array of Unicode code points to the buffer.
 * @property {() => void} guessSegmentProperties
 *   Auto-detect script, language, and direction.
 * @property {(dir: string) => void} setDirection
 *   Set the text direction (e.g. "ltr", "rtl").
 * @property {(flags: number) => void} setFlags
 *   Set buffer flags.
 * @property {(language: string) => void} setLanguage
 *   Set the buffer language (e.g. "MKD").
 * @property {(script: string) => void} setScript
 *   Set the buffer script (e.g. "cyrl").
 * @property {(level: number) => void} setClusterLevel
 *   Set the HarfBuzz clustering level.
 * @property {() => JsonGlyph[]} json
 *   Serialize shaped output to an array of {@link JsonGlyph} objects.
 * @property {() => void} destroy - Free the buffer.
 */

// ── Top-level harfbuzzjs instance ───────────────────────────────────

/**
 * The object returned by `hbjs(module)`.
 *
 * @typedef {object} HarfBuzz
 * @property {(data: ArrayBuffer | Uint8Array) => HBBlob} createBlob
 *   Create a blob from binary font data.
 * @property {(blob: HBBlob, index: number) => HBFace} createFace
 *   Create a face from a blob (use index 0 for single-font files).
 * @property {(face: HBFace) => HBFont} createFont
 *   Create a font from a face.
 * @property {() => HBBuffer} createBuffer
 *   Create an empty shaping buffer.
 * @property {(font: HBFont, buffer: HBBuffer, features?: string) => void} shape
 *   Shape the buffer contents using the given font and optional feature string.
 * @property {() => string} version_string
 *   Return the HarfBuzz version as a string (e.g. "8.3.0").
 * @property {() => {major: number, minor: number, micro: number}} version
 *   Return the HarfBuzz version as an object.
 */
