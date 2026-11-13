import { useEffect, useRef, useState } from "react";
import { useLanguage } from "../context.js";
import { copyText } from "../lib/clipboard.js";
import { Button } from "../ui/index.js";

export default function CopyButton({ value, label }) {
  const { text } = useLanguage();
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    setCopied(false);
  }, [value]);

  async function handleClick() {
    await copyText(value);
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <Button
      size="small"
      onClick={handleClick}
      aria-label={label ? `${text.copy} ${label}` : undefined}
    >
      {copied ? text.copied : text.copy}
    </Button>
  );
}
