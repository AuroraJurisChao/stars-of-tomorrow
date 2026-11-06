import { Avatar } from "@/components/Avatar";

export type CompetitionEntry = {
  id: number;
  name: string;
  rank: number;
  predict: number;
  riddle: number;
  match: number;
  total: number;
};

export function CompetitionList({
  entries,
  variant = "participant",
}: {
  entries: CompetitionEntry[];
  variant?: "participant" | "screen";
}) {
  return (
    <div
      className={`competition-list competition-list--${variant}`}
      aria-label="完整参与者排行榜"
    >
      {entries.map(entry => (
        <article
          className={`competition-row ${entry.rank <= 3 && entry.total > 0 ? "podium" : ""}`}
          key={entry.id}
        >
          <span className="competition-rank">
            <small>名次</small>
            {entry.rank}
          </span>
          <Avatar name={entry.name} size={variant === "screen" ? 46 : 38} />
          <strong className="competition-name">{entry.name}</strong>
          <div className="competition-score-parts">
            <span>
              真心话 <b>{entry.riddle}</b>
            </span>
            <span>
              预言 <b>{entry.predict}</b>
            </span>
            <span>
              连连看 <b>{entry.match}</b>
            </span>
          </div>
          <strong className="competition-total">
            {entry.total}
            <small>总分</small>
          </strong>
        </article>
      ))}
    </div>
  );
}
