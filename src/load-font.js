/** @import { HarfBuzz } from './types.js' */

/**
 * Load a font file into HarfBuzz and extract metadata.
 *
 * Reads the font binary, creates temporary HarfBuzz objects (blob → face → font)
 * to extract the family name, version string, and all script/language combinations
 * in the GSUB table that include a `locl` (localized forms) feature.
 *
 * @param {HarfBuzz} hb - Initialized harfbuzzjs instance (the object returned by `hbjs(module)`).
 * @param {File} file - A font file from a file input or drag-and-drop event.
 *   Accepted extensions: `.ttf`, `.otf`, `.woff`, `.woff2`.
 * @returns {Promise<{
 *   fontBuffer: Uint8Array,
 *   familyName: string,
 *   version: string,
 *   loclLangs: Array<{ script: string, lang: string }>,
 *   fileSize: number
 * }>} Resolves with the raw font bytes, parsed metadata, and the list of
 *   script/language pairs that support `locl` (e.g. `{ script: "cyrl", lang: "MKD" }`).
 * @throws {Error} If the file extension is not a supported font format.
 */
export async function loadFont(hb, file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['ttf', 'otf', 'woff', 'woff2'].includes(ext)) {
    throw new Error('Unsupported file type. Please use .ttf, .otf, .woff, or .woff2');
  }

  const fontBuffer = await file.bytes();

  const blob = hb.createBlob(fontBuffer);
  const face = hb.createFace(blob, 0);
  const font = hb.createFont(face);

  const familyName = face.getName(1, 'en') || face.getName(1, '') || file.name;
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

  font.destroy();
  face.destroy();
  blob.destroy();

  return { fontBuffer, familyName, version, loclLangs, fileSize: file.size };
}
