import { useLayoutEffect, useRef, useState } from "react";
import { Check, Link2, MousePointer2 } from "lucide-react";

export type MatchBoardCandidate = { id: number; name: string };
export type MatchBoardCard = {
  id: number;
  reason: string;
  anonymous: boolean;
  solved: boolean;
  solvedTarget: number | "anonymous" | null;
  attempts: number;
  wrongPicks: string[];
  score: number;
};

type Point = { x: number; y: number };
type DragState = {
  cardId: number;
  pointerId: number;
  start: Point;
  current: Point;
  moved: boolean;
};

function curve(start: Point, end: Point) {
  const distance = Math.max(24, Math.abs(end.x - start.x) * 0.46);
  const direction = end.x >= start.x ? 1 : -1;
  return `M ${start.x} ${start.y} C ${start.x + distance * direction} ${start.y}, ${end.x - distance * direction} ${end.y}, ${end.x} ${end.y}`;
}

export function MatchBoard({
  cards,
  candidates,
  disabled,
  pending,
  onAttempt,
}: {
  cards: MatchBoardCard[];
  candidates: MatchBoardCandidate[];
  disabled: boolean;
  pending: boolean;
  onAttempt: (nominationId: number, choice: number | "anonymous") => void;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const sourceRefs = useRef(new Map<number, HTMLButtonElement>());
  const targetRefs = useRef(new Map<string, HTMLButtonElement>());
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);
  const [selectedCardId, setSelectedCardId] = useState<number | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [lines, setLines] = useState<{ key: string; path: string }[]>([]);
  const selectedCard =
    cards.find(card => card.id === selectedCardId && !card.solved) ?? null;
  const targets = [
    ...candidates.map(candidate => ({
      key: String(candidate.id),
      choice: candidate.id as number | "anonymous",
      name: candidate.name,
    })),
    { key: "anonymous", choice: "anonymous" as const, name: "匿名" },
  ];
  const lineSignature = cards
    .map(card => `${card.id}:${card.solvedTarget ?? "open"}`)
    .join("|");

  useLayoutEffect(() => {
    const update = () => {
      const board = boardRef.current;
      if (!board) return;
      const bounds = board.getBoundingClientRect();
      const next: { key: string; path: string }[] = [];
      for (const card of cards) {
        if (!card.solved || card.solvedTarget === null) continue;
        const source = sourceRefs.current.get(card.id);
        const target = targetRefs.current.get(String(card.solvedTarget));
        if (!source || !target) continue;
        const from = source.getBoundingClientRect();
        const to = target.getBoundingClientRect();
        next.push({
          key: `${card.id}:${card.solvedTarget}`,
          path: curve(
            {
              x: from.right - bounds.left - 5,
              y: from.top + from.height / 2 - bounds.top,
            },
            {
              x: to.left - bounds.left + 5,
              y: to.top + to.height / 2 - bounds.top,
            }
          ),
        });
      }
      setLines(next);
    };
    update();
    const observer = new ResizeObserver(update);
    if (boardRef.current) observer.observe(boardRef.current);
    sourceRefs.current.forEach(element => observer.observe(element));
    targetRefs.current.forEach(element => observer.observe(element));
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [cards, candidates, lineSignature]);

  const pointFromEvent = (event: React.PointerEvent): Point => {
    const bounds = boardRef.current!.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };
  const choose = (cardId: number, choice: number | "anonymous") => {
    if (disabled || pending) return;
    const card = cards.find(item => item.id === cardId);
    if (!card || card.solved || card.wrongPicks.includes(String(choice)))
      return;
    onAttempt(cardId, choice);
    setSelectedCardId(null);
  };
  const pointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
    card: MatchBoardCard
  ) => {
    if (disabled || pending || card.solved || event.button !== 0) return;
    const point = pointFromEvent(event);
    const next = {
      cardId: card.id,
      pointerId: event.pointerId,
      start: point,
      current: point,
      moved: false,
    };
    dragRef.current = next;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const point = pointFromEvent(event);
    const moved =
      current.moved ||
      Math.hypot(point.x - current.start.x, point.y - current.start.y) > 6;
    const next = { ...current, current: point, moved };
    dragRef.current = next;
    if (moved) setDrag(next);
  };
  const pointerEnd = (
    event: React.PointerEvent<HTMLButtonElement>,
    cancelled = false
  ) => {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (!cancelled && current.moved) {
      const element = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>("[data-match-target]");
      const choice = element?.dataset.matchTarget;
      const valid = targets.some(target => target.key === choice);
      if (choice && valid)
        choose(
          current.cardId,
          choice === "anonymous" ? "anonymous" : Number(choice)
        );
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
    dragRef.current = null;
    setDrag(null);
  };

  return (
    <div
      className="match-board"
      ref={boardRef}
      onKeyDown={event => {
        if (event.key === "Escape") {
          setSelectedCardId(null);
          dragRef.current = null;
          setDrag(null);
        }
      }}
    >
      <svg className="match-lines" aria-hidden="true">
        {lines.map(line => (
          <path key={line.key} d={line.path} className="match-line-solved" />
        ))}
        {drag?.moved && (
          <path
            d={curve(drag.start, drag.current)}
            className="match-line-pending"
          />
        )}
      </svg>
      <div className="match-sources" aria-label="本人收到的全部欣赏话">
        {cards.map((card, index) => (
          <article
            className={`match-source-card ${card.solved ? "solved" : ""} ${selectedCardId === card.id && !card.solved ? "selected" : ""}`}
            key={card.id}
          >
            <button
              type="button"
              ref={element => {
                if (element) sourceRefs.current.set(card.id, element);
                else sourceRefs.current.delete(card.id);
              }}
              className="match-source-select"
              aria-pressed={selectedCardId === card.id && !card.solved}
              aria-label={`欣赏话 ${index + 1}${card.solved ? "，已连对" : "，选择后可连接候选作者"}`}
              disabled={disabled || card.solved}
              onPointerDown={event => pointerDown(event, card)}
              onPointerMove={pointerMove}
              onPointerUp={event => pointerEnd(event)}
              onPointerCancel={event => pointerEnd(event, true)}
              onClick={() => {
                if (suppressClickRef.current || card.solved) return;
                setSelectedCardId(current =>
                  current === card.id ? null : card.id
                );
              }}
            >
              <span className="match-source-meta">
                <span>欣赏话 {String(index + 1).padStart(2, "0")}</span>
                <span>{card.anonymous ? "可连接匿名" : "署名候选"}</span>
              </span>
              <span className="match-source-reason">{card.reason}</span>
              <span className="match-source-status">
                {card.solved ? (
                  <>
                    <Check size={14} />
                    已连对 · +{card.score}
                  </>
                ) : (
                  <>
                    第 {Math.min(4, card.attempts + 1)} 次连接 · 已尝试{" "}
                    {card.attempts} 次
                  </>
                )}
              </span>
              <i className="match-source-port" aria-hidden="true" />
            </button>
          </article>
        ))}
      </div>
      <aside className="match-targets" aria-label="本题组候选作者与匿名">
        <div className="match-targets-heading">
          <Link2 size={15} />
          <span>连接至</span>
        </div>
        <p>先选欣赏话，再选候选；也可从左侧拖到这里。</p>
        <div className="match-target-list">
          {targets.map(target => {
            const excluded =
              selectedCard?.wrongPicks.includes(target.key) ?? false;
            return (
              <button
                type="button"
                key={target.key}
                data-match-target={target.key}
                ref={element => {
                  if (element) targetRefs.current.set(target.key, element);
                  else targetRefs.current.delete(target.key);
                }}
                className={`${target.key === "anonymous" ? "anonymous" : ""} ${excluded ? "excluded" : ""}`}
                disabled={disabled || pending || !selectedCard || excluded}
                onClick={() =>
                  selectedCard && choose(selectedCard.id, target.choice)
                }
                aria-label={`连接到${target.name}${excluded ? "，当前欣赏话已排除" : ""}`}
              >
                <i className="match-target-port" aria-hidden="true" />
                <span className="match-target-avatar">
                  {target.name.slice(0, 1)}
                </span>
                <strong>{target.name}</strong>
                {excluded && <small>已排除</small>}
              </button>
            );
          })}
        </div>
        <span className="match-keyboard-note">
          <MousePointer2 size={13} />
          Enter／空格选择 · Esc 取消
        </span>
      </aside>
      <p className="match-board-help">
        同一位作者可连接多张欣赏话，匿名也可连接多卡。第 1／2／3 次连对分别
        +100／80／60，第 4 次起 +0；全部一次连对额外 +300。
      </p>
    </div>
  );
}
