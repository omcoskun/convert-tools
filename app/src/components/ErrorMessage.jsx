import { useLanguage } from "../context.js";
import Notice from "./Notice.jsx";

/**
 * Shows a failed core call as an error Notice: the tool's own sentence, the
 * localized meaning of the ConvertToolsError code from lang.json, then the
 * code itself in mono.
 * @param {{ summary: string, code: string }} props
 */
export default function ErrorMessage({ summary, code }) {
  const { errors } = useLanguage();
  return (
    <Notice tone="error">
      {summary} {errors[code]} <code>({code})</code>
    </Notice>
  );
}
