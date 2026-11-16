// Helpers for tests that read server-rendered HTML.

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', "#x27": "'", "#39": "'", nbsp: " " };

/** The text of rendered HTML with entities decoded and whitespace collapsed. */
export function visibleText(html) {
  return html
    .replace(/<!-- -->/g, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x27|#39|amp|lt|gt|quot|nbsp);/g, (match, name) => ENTITIES[name])
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The elements alone: without the <style> tags Emotion writes before them
 * on the server and the <!-- --> markers React puts between text parts.
 */
export function markup(html) {
  return html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, "").replace(/<!-- -->/g, "");
}

const VOID_ELEMENTS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

/**
 * The outer HTML of the first element whose opening tag contains the given
 * attribute text (e.g. 'data-widget="result"'), or null.
 */
export function element(html, attribute) {
  const source = markup(html);
  const start = source.search(new RegExp(`<[a-zA-Z][\\w-]*\\b[^>]*${attribute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  if (start < 0) return null;
  const tags = /<(\/?)([a-zA-Z][\w-]*)\b[^>]*?(\/?)>/g;
  tags.lastIndex = start;
  let depth = 0;
  for (let match = tags.exec(source); match; match = tags.exec(source)) {
    const [, closing, name, selfClosing] = match;
    if (!closing && (selfClosing || VOID_ELEMENTS.has(name.toLowerCase()))) {
      if (depth === 0) return match[0];
      continue;
    }
    depth += closing ? -1 : 1;
    if (depth === 0) return source.slice(start, tags.lastIndex);
  }
  return null;
}

/** Decodes the entities React writes into attribute values. */
export function decodeAttribute(value) {
  return value.replace(/&(#x27|#39|amp|lt|gt|quot|nbsp);/g, (match, name) => ENTITIES[name]);
}

/** The aria-label of every <button> in the HTML, decoded. */
export function buttonLabels(html) {
  return [...html.matchAll(/<button\b[^>]*>/g)]
    .map((match) => match[0].match(/aria-label="([^"]*)"/))
    .filter(Boolean)
    .map((match) => decodeAttribute(match[1]));
}
