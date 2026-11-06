import { Sparkles } from "lucide-react";

export function EmptyState({ title, description, dark = false }: { title: string; description: string; dark?: boolean }) {
  return (
    <div className={`empty-state ${dark ? "empty-dark" : ""}`}>
      <Sparkles size={28} strokeWidth={1.25} aria-hidden="true" />
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
