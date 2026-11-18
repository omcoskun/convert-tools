import { useEffect, useRef } from "react";

/** Static, deterministic stars: redrawn only on resize, with no animation loop. */
export default function SpaceBackdrop() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    const context = canvas.getContext("2d");
    if (!context) return undefined;
    let drawnWidth = 0;
    let drawnHeight = 0;
    // One small pre-rendered glow, drawn per bright star with drawImage.
    function glowSprite(ratio) {
      const size = Math.ceil(14 * ratio);
      const sprite = document.createElement("canvas");
      sprite.width = size;
      sprite.height = size;
      const inner = sprite.getContext("2d");
      if (!inner) return null;
      const gradient = inner.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      gradient.addColorStop(0, "rgba(157, 191, 255, 0.24)");
      gradient.addColorStop(1, "rgba(157, 191, 255, 0)");
      inner.fillStyle = gradient;
      inner.fillRect(0, 0, size, size);
      return sprite;
    }
    function draw() {
      const { width, height } = canvas.getBoundingClientRect();
      if (!width || !height) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const pixelWidth = Math.round(width * ratio);
      const pixelHeight = Math.round(height * ratio);
      // ResizeObserver can report an unchanged size; resetting canvas.width
      // would clear and repaint everything for nothing.
      if (pixelWidth === drawnWidth && pixelHeight === drawnHeight) return;
      drawnWidth = pixelWidth;
      drawnHeight = pixelHeight;
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.fillStyle = "#030711";
      context.fillRect(0, 0, width, height);
      // A cloud only paints its own bounding square, not the whole canvas.
      const cloud = (x, y, radius, color) => {
        const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, "transparent");
        context.fillStyle = gradient;
        context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      };
      cloud(width * 0.7, height * 0.25, width * 0.65, "rgba(37, 64, 114, 0.3)");
      cloud(width * 0.15, height * 0.85, width * 0.5, "rgba(58, 43, 92, 0.22)");
      const sprite = glowSprite(ratio);
      let seed = 8457;
      const random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      const count = Math.round(width * height / 1100);
      for (let index = 0; index < count; index += 1) {
        const x = random() * width;
        const y = random() * height;
        const bright = random();
        const radius = bright > 0.985 ? 1.35 : 0.35 + random() * 0.55;
        if (bright > 0.985 && sprite) context.drawImage(sprite, x - 7, y - 7, 14, 14);
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        const rgb = index % 7 === 0 ? "245, 218, 180" : "195, 215, 248";
        context.fillStyle = `rgba(${rgb}, ${0.18 + bright * 0.65})`;
        context.fill();
      }
    }
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);
  return <canvas ref={ref} className="map-space" aria-hidden="true" />;
}
