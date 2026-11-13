/**
 * Runs a core call and turns a ConvertToolsError into a value the UI can
 * show. Anything else is a bug and is rethrown rather than displayed as
 * "invalid input".
 * @template T
 * @param {() => T} run
 * @returns {{ ok: true, value: T } | { ok: false, code: string }}
 */
export function attempt(run) {
  try {
    return { ok: true, value: run() };
  } catch (error) {
    if (error != null && error.name === "ConvertToolsError" && typeof error.code === "string") {
      return { ok: false, code: error.code };
    }
    throw error;
  }
}
