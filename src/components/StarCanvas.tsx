import { useEffect, useRef } from "react";

type Star = { x: number; y: number; radius: number; alpha: number };

export function StarCanvas({ className = "", constellation = false }: { className?: string; constellation?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = rect.width;
      const height = rect.height;
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const count = Math.max(30, Math.min(130, Math.round((width * height) / 9000)));
      const stars: Star[] = Array.from({ length: count }, (_, index) => ({
        x: ((index * 73.13) % 100) / 100 * width,
        y: ((index * 41.77 + 13) % 100) * height / 100,
        radius: 0.45 + ((index * 17) % 10) / 9,
        alpha: 0.18 + (index % 6) * 0.06,
      }));
      context.clearRect(0, 0, width, height);
      stars.forEach((star, index) => {
        context.beginPath();
        context.fillStyle = `rgba(244, 241, 234, ${star.alpha})`;
        context.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        context.fill();
        if (index % 23 === 0) {
          context.strokeStyle = `rgba(216, 190, 140, ${star.alpha * 0.55})`;
          context.lineWidth = 0.6;
          context.beginPath();
          context.moveTo(star.x - 4, star.y);
          context.lineTo(star.x + 4, star.y);
          context.moveTo(star.x, star.y - 4);
          context.lineTo(star.x, star.y + 4);
          context.stroke();
        }
      });
      if (constellation) {
        context.lineWidth = 0.45;
        for (let index = 4; index < stars.length; index += 19) {
          const from = stars[index];
          const to = stars[index + 1];
          if (!to) continue;
          context.strokeStyle = "rgba(216, 190, 140, 0.06)";
          context.beginPath();
          context.moveTo(from.x, from.y);
          context.lineTo(to.x, to.y);
          context.stroke();
        }
      }
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [constellation]);
  return <canvas ref={ref} className={`star-canvas ${className}`} aria-hidden="true" />;
}
