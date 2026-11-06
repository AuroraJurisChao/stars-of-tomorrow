const COLORS = ["#C2704E", "#DFA05B", "#C9A227", "#7E9070", "#9C6B3F", "#B49B72", "#C08A8A", "#8A8073"];

export function avatarColor(name: string) {
  const hash = Array.from(name).reduce((sum, char) => (sum * 31 + (char.codePointAt(0) ?? 0)) >>> 0, 7);
  return COLORS[hash % COLORS.length];
}

export function Avatar({ name, size = 48, className = "" }: { name: string; size?: number; className?: string }) {
  return (
    <span
      className={`avatar ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(14, size * 0.42), backgroundColor: avatarColor(name) }}
      aria-label={name}
    >
      {Array.from(name)[0] ?? "星"}
    </span>
  );
}
