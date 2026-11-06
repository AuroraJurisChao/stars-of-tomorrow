import { Link, useSearchParams } from "react-router";
import {
  Eye,
  EyeOff,
  Home,
  Hourglass,
  MonitorUp,
  Sparkles,
  Star,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Brand } from "@/components/Layout";
import { StarCanvas } from "@/components/StarCanvas";
import { CollectStage } from "@/components/CollectStage";
import { Avatar } from "@/components/Avatar";
import { Laurel } from "@/components/Laurel";
import { EmptyState } from "@/components/EmptyState";
import { CollapsibleReason } from "@/components/CollapsibleReason";
import { CompetitionList } from "@/components/CompetitionList";
import { PHASE_LABELS } from "@contracts/constants";
import { useNow } from "@/lib/interaction";

export default function Screen() {
  const [searchParams] = useSearchParams();
  const districtId = searchParams.get("districtId") ?? undefined;
  const screen = trpc.public.screen.useQuery(
    districtId ? { districtId } : undefined,
    { refetchInterval: 1200, retry: 1 }
  );
  const now = useNow(250);
  const data = screen.data;
  const elapsedSinceFetch = Math.max(0, now - screen.dataUpdatedAt);
  const awardMaxRank =
    data?.phase === "award" && data.winners.length > 0
      ? Math.max(...data.winners.map(winner => winner.rank))
      : 0;
  return (
    <div
      className={`big-screen big-screen--collect ${data?.phase === "collect" ? "" : "big-screen--games"}`}
    >
      <StarCanvas constellation />
      {data && data.phase !== "collect" && (
        <div className="screen-stage-ambient">
          <CollectStage variant="screen" />
        </div>
      )}
      <header className="screen-header">
        <Brand dark />
        <div className="screen-header-status">
          <div className="screen-live">
            <span className="live-dot" />
            LIVE · {data ? PHASE_LABELS[data.phase] : "连接中"}
          </div>
        </div>
        <Link to="/" className="screen-home">
          <Home size={17} />
          返回首页
        </Link>
      </header>
      <main className="screen-main">
        {screen.isError ? (
          <div className="screen-error">
            <MonitorUp />
            <h1>大屏暂时无法连接</h1>
            <p>{screen.error.message}</p>
            <button onClick={() => void screen.refetch()}>重新连接</button>
          </div>
        ) : !data ? (
          <div className="screen-loading">
            <Sparkles />
            <p>星空正在亮起</p>
          </div>
        ) : (
          <>
            {data.phase === "collect" && (
              <section
                className="screen-collect"
                aria-labelledby="screen-title"
              >
                <div className="screen-copy">
                  <p className="screen-kicker">
                    A CONSTELLATION OF APPRECIATION
                  </p>
                  <h1 id="screen-title">明日之星</h1>
                  <p className="screen-subtitle">
                    <span>会前收集</span>
                    <i aria-hidden="true" />
                    <span>欣赏仍在汇聚</span>
                  </p>
                </div>
                <CollectStage variant="screen" />
              </section>
            )}
            {data.phase === "prepare" && (
              <section className="screen-waiting screen-prepare">
                <Hourglass className="giant-symbol" />
                <p className="screen-kicker">PREPARING THE REAL MOMENT</p>
                <h1>现场筹备</h1>
                <p>
                  欣赏收集已截止，欣赏卡快照已固定。
                  <br />
                  主持人正在准备，筹备不等于开考。
                </p>
                <span className="screen-mode-note">请留意主持人提示</span>
              </section>
            )}
            {data.phase === "riddle" && "riddle" in data && (
              <section className="screen-riddle">
                <p className="screen-kicker">WHO IS THIS APPRECIATION FOR?</p>
                <h1>真心话抢答</h1>
                {!data.riddle?.card ? (
                  <EmptyState
                    dark
                    title="等待组织者指定题目"
                    description="全部快照卡都可抽取，包含匿名卡；不会生成虚构谜面。"
                  />
                ) : (
                  <>
                    <span className="screen-question-number">
                      真心话 · 猜这句欣赏写给谁
                    </span>
                    <div className="screen-riddle-focus">
                      {data.riddle.card.reason ? (
                        <CollapsibleReason text={data.riddle.card.reason} />
                      ) : (
                        <div className="screen-riddle-placeholder">
                          谜面已就位，等待展示
                        </div>
                      )}
                    </div>
                    {data.riddle.status === "answering" && (
                      <div className="answer-pulse">
                        <span />
                        抢答进行中 ·{" "}
                        {Math.ceil(
                          Math.max(
                            0,
                            data.riddle.remainingMs - elapsedSinceFetch
                          ) / 1000
                        )}
                        s · 已收到 {data.riddle.answerCount} 份答案
                      </div>
                    )}
                    {data.riddle.status === "closed" && (
                      <div className="answer-pulse answer-closed">
                        <Hourglass size={18} />
                        作答已截止 · 等待揭晓接收人
                      </div>
                    )}
                    {data.riddle.status === "ready" && (
                      <p className="screen-status-note">
                        服务端 30 秒计时尚未开始
                      </p>
                    )}
                    {data.riddle.status === "revealed" &&
                      data.riddle.card.recipientName && (
                        <div className="screen-recipient">
                          <span>这句欣赏写给</span>
                          <Avatar
                            name={data.riddle.card.recipientName}
                            size={90}
                          />
                          <h2>{data.riddle.card.recipientName}</h2>
                        </div>
                      )}
                  </>
                )}
              </section>
            )}
            {data.phase === "predict" && (
              <section className="screen-waiting">
                <span className="giant-symbol">✦</span>
                <p className="screen-kicker">PREDICT THE BRIGHTEST WORDS</p>
                <h1>全民预言家</h1>
                <p>
                  从已审核关键词中选出 3 个不同标签。
                  <br />
                  每命中 Top 5 加 100，三个全中额外加 300。
                </p>
                <span className="screen-mode-note">
                  第五名同频并列全部命中 · 不公开单个标签频次
                </span>
              </section>
            )}
            {data.phase === "predict-reveal" && "keywords" in data && (
              <section className="screen-rankings">
                <p className="screen-kicker">THE WORDS THAT LIT US UP</p>
                <h1>欣赏关键词 · Top 5（含并列）</h1>
                {data.keywords.length === 0 ? (
                  <EmptyState
                    dark
                    title="暂无可揭晓的命中词"
                    description="未发布或候选不足 5 个时不开考，不生成虚构榜单。"
                  />
                ) : (
                  <div className="top5-grid">
                    {[...data.keywords].reverse().map(item => (
                      <div
                        className={`top5-item ${item.revealed ? "revealed" : "hidden-item"}`}
                        key={item.keyword}
                      >
                        <span className="rank-number">
                          {String(item.rank).padStart(2, "0")}
                        </span>
                        {item.revealed ? (
                          <>
                            <strong>{item.keyword}</strong>
                            <span className="keyword-hit-label">
                              TOP 5 命中
                            </span>
                          </>
                        ) : (
                          <span className="hidden-word">等待揭晓</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <p className="settled-note">
                  <Star size={16} />
                  已揭晓 {
                    data.keywords.filter(item => item.revealed).length
                  } / {data.keywords.length} · 同频并列全部计入
                </p>
              </section>
            )}
            {data.phase === "match" && "matchEndsAt" in data && (
              <section className="screen-match">
                <p className="screen-kicker">CONNECT THE APPRECIATION</p>
                <h1>欣赏连连看</h1>
                <div className="screen-countdown">
                  {data.matchEndsAt
                    ? `${Math.floor(Math.max(0, Math.ceil((data.matchEndsAt.getTime() - now) / 1000)) / 60)}:${String(Math.max(0, Math.ceil((data.matchEndsAt.getTime() - now) / 1000)) % 60).padStart(2, "0")}`
                    : "--:--"}
                </div>
                <p>
                  {data.matchEndsAt
                    ? "全场统一 120 秒 · 刷新与重开不会延长"
                    : "全场计时尚未启动 · 筹备不等于开考"}
                </p>
                {data.wall.length === 0 ? (
                  <EmptyState
                    dark
                    title="本选区暂无成员"
                    description="不会生成虚构参与者或完成状态。"
                  />
                ) : (
                  <div className="match-wall">
                    {data.wall.map(member => (
                      <div
                        className={member.finished ? "finished" : ""}
                        key={member.id}
                      >
                        <Avatar name={member.name} size={44} />
                        <span>{member.name}</span>
                        {member.finished ? (
                          <Eye size={14} />
                        ) : (
                          <EyeOff size={14} />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
            {data.phase === "rank" && "leaderboard" in data && (
              <section className="screen-leaderboard">
                <p className="screen-kicker">EVERY PARTICIPATION SHINES</p>
                <h1>星光排行榜 · 完整名单</h1>
                <p className="screen-section-note">
                  仅列入实际参与者 · 含 0 分 · 同分同名次并跳位
                </p>
                {data.leaderboard.length === 0 ? (
                  <EmptyState
                    dark
                    title="还没有实际参与者"
                    description="仅打开页面不进入名单；真实作答、保存预言、连连看尝试或主动交卷后才会列入。"
                  />
                ) : (
                  <CompetitionList
                    entries={data.leaderboard}
                    variant="screen"
                  />
                )}
              </section>
            )}
            {data.phase === "award" && "winners" in data && (
              <section className="screen-awards">
                <p className="screen-kicker">THE STARS OF TOMORROW</p>
                <h1>明日之星 · 星光加冕</h1>
                {data.winners.length === 0 ? (
                  <EmptyState
                    dark
                    title="本场没有获奖者"
                    description={
                      data.leaderboard.length === 0
                        ? "还没有实际参与者，不生成奖项。"
                        : "实际参与者均为 0 分，因此不设置获奖者；完整名单仍如实保留。"
                    }
                  />
                ) : (
                  <div className="winner-stage">
                    {data.winners
                      .filter(winner => winner.rank <= data.step)
                      .map(winner => (
                        <article className="winner-card" key={winner.id}>
                          <div className="winner-medallion">
                            <Laurel />
                            <Avatar name={winner.name} size={112} />
                          </div>
                          <span className="winner-label">
                            明日之星 · 第 {winner.rank} 名
                          </span>
                          <h2>{winner.name}</h2>
                          <p>
                            三项游戏总分 <strong>{winner.total}</strong>
                          </p>
                          <div className="winner-score-parts">
                            <span>真心话 {winner.riddle}</span>
                            <span>预言 {winner.predict}</span>
                            <span>连连看 {winner.match}</span>
                          </div>
                        </article>
                      ))}
                  </div>
                )}
                {data.winners.length > 0 && data.step === 0 && (
                  <p className="screen-empty-note">
                    前三个名次含并列 · 同一名次同批揭晓
                  </p>
                )}
                {data.step > awardMaxRank && (
                  <div className="self-quotes">
                    <h3>
                      <Sparkles />
                      写给自己的光
                    </h3>
                    {data.selfQuotes.length === 0 ? (
                      <p>本场没有公开的自我欣赏金句</p>
                    ) : (
                      data.selfQuotes.map(quote => (
                        <CollapsibleReason
                          key={`${quote.name}-${quote.reason}`}
                          text={quote.reason}
                          attribution={quote.name}
                          quote
                        />
                      ))
                    )}
                  </div>
                )}
                <div className="screen-full-results">
                  <div className="screen-results-heading">
                    <h2>完整参与名单</h2>
                    <span>总分 = 真心话 + 预言 + 连连看</span>
                  </div>
                  {data.leaderboard.length > 0 && (
                    <CompetitionList
                      entries={data.leaderboard}
                      variant="screen"
                    />
                  )}
                </div>
              </section>
            )}
          </>
        )}
      </main>
      <footer className="screen-footer">
        <span>明日之星 · 每一束微光都值得被铭记</span>
        <span>{data?.districtName ?? (screen.isError ? "选区连接失败" : "选区信息加载中")}</span>
      </footer>
    </div>
  );
}
