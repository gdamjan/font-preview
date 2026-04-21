/**
 * Load a font file into HarfBuzz and extract metadata.
 * @param {object} hb - harfbuzzjs instance
 * @param {File} file
 * @returns {{ fontBuffer: Uint8Array, familyName: string, version: string, loclLangs: Array<{script: string, lang: string}> }}
 */
export async function loadFont(hb, file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['ttf', 'otf', 'woff', 'woff2'].includes(ext)) {
    throw new Error('Unsupported file type. Please use .ttf, .otf, .woff, or .woff2');
  }

  const arrayBuffer = await file.arrayBuffer();
  const fontBuffer = new Uint8Array(arrayBuffer);

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
