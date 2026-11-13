// Webpack loader for MapLibre's ESM build (node_modules/maplibre-gl/dist/
// maplibre-gl.mjs). The library reads import.meta.url only to guess where its
// worker file is; webpack would replace that expression with the file:// URL
// of the package on the build machine, which would put a local path into the
// published bundle. The app sets the worker URL itself (src/map/maplibre.js),
// so the guess is not needed and the expression becomes an empty string.

module.exports = function blankImportMetaUrl(source) {
  if (!source.includes("import.meta.url")) {
    this.emitWarning(new Error("import.meta.url not found: check whether this loader is still needed."));
    return source;
  }
  return source.replaceAll("import.meta.url", '""');
};
