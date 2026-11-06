import { useEffect, useState } from "react";

type Meteor = {
  key: number;
  top: number;
  left: number;
  length: number;
  duration: number;
  opacity: number;
  angle: number;
  moveX: number;
  moveY: number;
};

const stars = Array.from({ length: 54 }, (_, index) => ({
  x: (index * 37.73 + 7) % 100,
  y: (index * 61.17 + 11) % 100,
  r: index % 13 === 0 ? 1.15 : index % 5 === 0 ? 0.8 : 0.5,
  opacity: index % 7 === 0 ? 0.42 : 0.22,
}));

export function HomeSky() {
  const [meteor, setMeteor] = useState<Meteor | null>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const schedule = (delay: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(launch, delay);
    };
    const launch = () => {
      if (stopped || document.hidden || reduced.matches) return;
      const fromLeft = Math.random() > 0.5;
      const upper = Math.random() > 0.5;
      const duration = 800 + Math.round(Math.random() * 300);
      const next = {
        key: Date.now(),
        top: upper ? 7 + Math.random() * 13 : 76 + Math.random() * 12,
        left: fromLeft ? 3 + Math.random() * 11 : 82 + Math.random() * 10,
        length: 64 + Math.round(Math.random() * 32),
        duration,
        opacity: 0.28 + Math.random() * 0.07,
        angle: fromLeft ? 28 : 152,
        moveX: fromLeft ? 52 : -52,
        moveY: 28,
      };
      setMeteor(next);
      timer = setTimeout(() => {
        setMeteor(null);
        schedule(18000 + Math.random() * 8000);
      }, duration);
    };
    const visibility = () => {
      if (document.hidden) {
        if (timer) clearTimeout(timer);
        setMeteor(null);
      } else {
        schedule(5000 + Math.random() * 1500);
      }
    };
    const motionChange = () => {
      if (reduced.matches) {
        if (timer) clearTimeout(timer);
        setMeteor(null);
      } else {
        schedule(5000);
      }
    };
    schedule(5000 + Math.random() * 1500);
    document.addEventListener("visibilitychange", visibility);
    reduced.addEventListener("change", motionChange);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibility);
      reduced.removeEventListener("change", motionChange);
    };
  }, []);

  return (
    <div className="home-sky" aria-hidden="true">
      <svg className="home-static-stars" width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        {stars.map((star, index) => <circle key={index} cx={star.x} cy={star.y} r={star.r / 5} fill="#F4F1EA" opacity={star.opacity} />)}
        <path d="M12 27h2.4M13.2 25.8v2.4M88 63h2M89 62v2M76 14h1.8M76.9 13.1v1.8" stroke="#D8BE8C" strokeWidth="0.12" opacity="0.45" />
      </svg>
      {meteor && <span
        key={meteor.key}
        className="home-meteor"
        style={{
          top: `${meteor.top}%`,
          left: `${meteor.left}%`,
          width: `${meteor.length}px`,
          "--meteor-duration": `${meteor.duration}ms`,
          "--meteor-opacity": meteor.opacity,
          "--meteor-angle": `${meteor.angle}deg`,
          "--meteor-x": `${meteor.moveX}px`,
          "--meteor-y": `${meteor.moveY}px`,
        } as React.CSSProperties}
      />}
    </div>
  );
}
