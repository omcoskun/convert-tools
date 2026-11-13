import { useLanguage } from "../context.js";
import { Alert } from "../ui/index.js";

/**
 * Shows a failed core call: the tool's own sentence, the localized meaning of
 * the ConvertToolsError code from lang.json and the code itself.
 */
export default function ErrorMessage({ summary, code }) {
  const { errors } = useLanguage();
  return (
    <Alert severity="error" role="alert" sx={{ mt: 2 }}>
      {summary} {errors[code]} <code>({code})</code>
    </Alert>
  );
}
