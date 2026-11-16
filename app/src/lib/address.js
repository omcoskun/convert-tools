// The address (#hash) of the demo: "#<tool>" opens a tool, and
// "#<tool>/<section>" a place inside it (see tools/index.js, resolveTool).

/**
 * The place inside a tool an address names: sectionOf("reference/errors")
 * is "errors"; null without one.
 * @param {string} hashId the address without "#"
 * @returns {string | null}
 */
export function sectionOf(hashId) {
  const slash = hashId.indexOf("/");
  return slash < 0 || slash === hashId.length - 1 ? null : hashId.slice(slash + 1);
}
