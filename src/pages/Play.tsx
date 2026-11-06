import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  Gamepad2,
  Hand,
  Hourglass,
  Link2,
  Medal,
  Send,
  Star,
  Trophy,
  XCircle,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import { LoadingPage, PageShell } from "@/components/Layout";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { CollectStage } from "@/components/CollectStage";
import { CollapsibleReason } from "@/components/CollapsibleReason";
import { MatchBoard } from "@/components/MatchBoard";
import { CompetitionList } from "@/components/CompetitionList";
import { useViewer } from "@/lib/viewer";
import { errorMessage, useNow } from "@/lib/interaction";
import { PHASE_LABELS } from "@contracts/constants";
import { screenPath } from "@contracts/screen";

export default function Play() {
  const { viewer, isLoading, logout } = useViewer();
  const bootstrap = trpc.auth.bootstrap.useQuery(
    { districtId: viewer?.districtId },
    { enabled: viewer?.role === "member" }
  );
  const utils = trpc.useUtils();
  const game = trpc.game.state.useQuery(undefined, {
    enabled: viewer?.role === "member",
    refetchInterval: 1500,
    retry: false,
  });
  const [picks, setPicks] = useState<string[]>([]);
  const [predictionReady, setPredictionReady] = useState(false);
  const [pickedRecipient, setPickedRecipient] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const now = useNow(250);
  const invalidate = async () => {
    await utils.game.state.invalidate();
  };
  const prediction = trpc.game.submitPrediction.useMutation({
    onSuccess: async () => {
      setMessage("三个预言已保存；中控截止前仍可修改");
      setError("");
      await invalidate();
    },
    onError: async cause => {
      setError(errorMessage(cause));
      await invalidate();
    },
  });
  const answer = trpc.game.answerRiddle.useMutation({
    onSuccess: async result => {
      setMessage(result.message);
      setError("");
      await invalidate();
    },
    onError: async cause => {
      setError(errorMessage(cause));
      await invalidate();
    },
  });
  const attempt = trpc.game.matchAttempt.useMutation({
    onSuccess: async result => {
      setMessage(
        result.correct
          ? `连对成功，本卡 +${result.score}`
          : "这个选择已排除，可以再试一次"
      );
      setError("");
      await invalidate();
    },
    onError: async cause => {
      setError(errorMessage(cause));
      await invalidate();
    },
  });
  const finish = trpc.game.finishMatch.useMutation({
    onSuccess: async result => {
      setMessage(`连连看已结算 · ${result.totalScore} 分`);
      setError("");
      await invalidate();
    },
    onError: async cause => {
      setError(errorMessage(cause));
      await invalidate();
    },
  });

  // Server phase/card transitions intentionally reset only ephemeral local form state.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setPredictionReady(false);
    setPicks([]);
    setMessage("");
    setError("");
  }, [game.data?.phase]);
  useEffect(() => {
    if (!predictionReady && game.data?.predict?.own) {
      setPicks(game.data.predict.own.picks);
      setPredictionReady(true);
    }
  }, [game.data?.predict?.own, predictionReady]);
  useEffect(() => {
    setPickedRecipient(null);
    setMessage("");
  }, [game.data?.riddle?.card?.id]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const members = useMemo(
    () => bootstrap.data?.members ?? [],
    [bootstrap.data]
  );
  if (isLoading) return <LoadingPage dark />;
  if (!viewer || viewer.role !== "member")
    return (
      <PageShell viewer={viewer} onLogout={logout} dark>
        <div className="gate-panel">
          <Gamepad2 />
          <h1>请以成员身份登录</h1>
          <p>游戏选择与得分均绑定服务端会话。</p>
          <Link className="gold-button" to="/">
            返回登录
          </Link>
        </div>
      </PageShell>
    );

  const data = game.data;
  const match = data?.match;
  const elapsedSinceFetch = Math.max(0, now - game.dataUpdatedAt);
  const matchRemainingMs = match?.active
    ? Math.max(0, match.remainingMs - elapsedSinceFetch)
    : 0;
  const secondsLeft = Math.ceil(matchRemainingMs / 1000);
  const riddleRemainingMs =
    data?.riddle?.status === "answering"
      ? Math.max(0, data.riddle.remainingMs - elapsedSinceFetch)
      : 0;
  const riddleSeconds = Math.ceil(riddleRemainingMs / 1000);

  return (
    <PageShell
      viewer={viewer}
      onLogout={logout}
      dark
      className="play-shell play-shell--collect"
    >
      {data?.phase !== "collect" && (
        <div className="play-stage-ambient">
          <CollectStage variant="participant" />
        </div>
      )}
      <div className="play-topbar">
        <div>
          <p className="eyebrow left">LIVE PARTICIPANT</p>
          <h1>{data ? PHASE_LABELS[data.phase] : "参与者现场"}</h1>
        </div>
        <div className="personal-score-stack">
          <div
            className="my-score"
            aria-label={`个人总分 ${data?.score.total ?? 0}`}
          >
            <Star size={18} />
            <span>个人总分</span>
            <strong>{data?.score.total ?? 0}</strong>
          </div>
          <div className="my-score-parts">
            <span>真心话 {data?.score.riddle ?? 0}</span>
            <span>预言 {data?.score.predict ?? 0}</span>
            <span>连连看 {data?.score.match ?? 0}</span>
          </div>
        </div>
      </div>
      <div className="live-hint">
        <span className="live-dot" />
        与组织者大屏实时同步
        <Link to={screenPath(viewer.districtId)}>
          打开大屏
          <ArrowRight size={14} />
        </Link>
      </div>
      {message && (
        <p className="floating-success">
          <CheckCircle2 size={16} />
          {message}
        </p>
      )}
      {error && (
        <p className="floating-error" role="alert">
          {error}
        </p>
      )}
      {game.isLoading ? (
        <div className="stage-loading">
          <Hourglass />
          <p>正在读取现场状态</p>
        </div>
      ) : game.isError && !data ? (
        <div className="stage-loading" role="alert">
          <XCircle className="stage-icon" />
          <h2>暂时无法读取现场状态</h2>
          <p>{errorMessage(game.error)}</p>
          <button
            className="outline-button"
            disabled={game.isFetching}
            onClick={() => void game.refetch()}
          >
            {game.isFetching ? "正在重新读取…" : "重新读取"}
          </button>
        </div>
      ) : !data ? (
        <div className="stage-loading" role="alert">
          <XCircle className="stage-icon" />
          <h2>现场状态暂不可用</h2>
          <p>请重新读取，不会生成或补写任何现场数据。</p>
          <button
            className="outline-button"
            disabled={game.isFetching}
            onClick={() => void game.refetch()}
          >
            {game.isFetching ? "正在重新读取…" : "重新读取"}
          </button>
        </div>
      ) : (
        <>
          {data.phase === "collect" && (
            <section className="collect-layout" aria-labelledby="collect-title">
              <div className="collect-copy">
                <p className="section-kicker">
                  A CONSTELLATION OF APPRECIATION
                </p>
                <h2 id="collect-title">欣赏仍在汇聚</h2>
                <p className="collect-description">
                  你的一句真诚欣赏，
                  <br className="desktop-break" />
                  会成为今晚的一颗星。
                </p>
                <div className="collect-actions">
                  <Link to="/nominate" className="button-primary">
                    <span>去写欣赏</span>
                    <ArrowRight size={19} />
                  </Link>
                  <Link to="/" className="button-secondary">
                    <ArrowLeft size={16} />
                    返回首页
                  </Link>
                </div>
              </div>
              <CollectStage variant="participant" />
            </section>
          )}

          {data.phase === "prepare" && (
            <section className="play-stage centered-stage">
              <Hourglass className="stage-icon" />
              <h2>现场筹备中</h2>
              <p>
                欣赏收集已经截止，欣赏卡快照已经固定。主持人正在准备，筹备不等于开考。
              </p>
              <span className="stage-note">请留意大屏与主持人提示</span>
            </section>
          )}

          {(data.phase === "rank" || data.phase === "award") && (
            <section className="play-stage participant-results">
              <div className="stage-heading">
                <span className="stage-index">
                  {data.phase === "rank" ? "04" : "05"}
                </span>
                <div>
                  <h2>
                    {data.phase === "rank"
                      ? "完整星光排行"
                      : "明日之星 · 星光加冕"}
                  </h2>
                  <p>
                    只列出本场有真实参与行为的人；未参加者不补
                    0，同分同名次并跳位。
                  </p>
                </div>
              </div>
              {data.phase === "award" && (
                <div className="participant-winners">
                  {data.winners.length === 0 ? (
                    <p>本场参与者均为 0 分，不设置获奖者。</p>
                  ) : data.step === 0 ? (
                    <p>
                      <Medal size={18} />
                      等待揭晓前三个名次，并列者将同批出现
                    </p>
                  ) : (
                    data.winners
                      .filter(winner => winner.rank <= data.step)
                      .map(winner => (
                        <div key={winner.id}>
                          <span>第 {winner.rank} 名</span>
                          <Avatar name={winner.name} size={48} />
                          <strong>{winner.name}</strong>
                          <b>{winner.total} 分</b>
                        </div>
                      ))
                  )}
                </div>
              )}
              {data.leaderboard.length === 0 ? (
                <EmptyState
                  dark
                  title="还没有实际参与者"
                  description="仅打开页面不会进入名单；真实作答、保存预言、连连看尝试或主动交卷后才会列入。"
                />
              ) : (
                <CompetitionList entries={data.leaderboard} />
              )}
              <strong className="stage-score">
                我的本场总分 · {data.score.total}
              </strong>
            </section>
          )}

          {data.phase === "riddle" && (
            <section className="play-stage riddle-stage game-panel">
              <div className="stage-heading">
                <span className="stage-index">01</span>
                <div>
                  <h2>真心话抢答</h2>
                  <p>聚焦这一句欣赏：它写给谁？选人后再确认，每人每题一次。</p>
                </div>
              </div>
              {!data.riddle?.card ? (
                <EmptyState
                  dark
                  title="等待组织者指定真心话"
                  description="全部快照卡都可抽取，包含匿名卡；没有题目时不会生成替代谜面。"
                />
              ) : (
                <>
                  <div className="riddle-number">
                    APPRECIATION CARD ·{" "}
                    {String(data.riddle.card.id).padStart(3, "0")}
                  </div>
                  <div className="riddle-focus-card">
                    {data.riddle.card.reason ? (
                      <CollapsibleReason text={data.riddle.card.reason} />
                    ) : (
                      <EmptyState
                        dark
                        title="题目已就位"
                        description="谜面尚未展示，服务端 30 秒计时也尚未开始。"
                      />
                    )}
                  </div>
                  {data.riddle.status === "answering" && (
                    <div
                      className={`riddle-timer ${riddleSeconds <= 5 ? "urgent" : ""}`}
                    >
                      <Clock3 size={17} />
                      <strong>{riddleSeconds}s</strong>
                      <span>服务端作答剩余时间</span>
                    </div>
                  )}
                  {data.riddle.status === "answering" &&
                    riddleRemainingMs > 0 &&
                    !data.riddle.own && (
                      <>
                        <div className="answer-grid">
                          {members.map(member => (
                            <button
                              key={member.id}
                              aria-pressed={pickedRecipient === member.id}
                              className={
                                pickedRecipient === member.id ? "selected" : ""
                              }
                              onClick={() => setPickedRecipient(member.id)}
                            >
                              <Avatar name={member.name} size={36} />
                              <span>{member.name}</span>
                            </button>
                          ))}
                        </div>
                        <button
                          className="gold-button riddle-submit"
                          disabled={!pickedRecipient || answer.isPending}
                          onClick={() =>
                            pickedRecipient &&
                            answer.mutate({
                              nominationId: data.riddle!.card!.id,
                              pickedRecipientId: pickedRecipient,
                            })
                          }
                        >
                          <Hand size={18} />
                          {answer.isPending
                            ? "正在记录…"
                            : pickedRecipient
                              ? `确认选择 ${members.find(member => member.id === pickedRecipient)?.name ?? "这位同事"}`
                              : "请先选择接收人"}
                        </button>
                      </>
                    )}
                  {data.riddle.status === "answering" &&
                    riddleRemainingMs <= 0 &&
                    !data.riddle.own && (
                      <div className="answer-wait">
                        <Clock3 />
                        <p>本题作答时间已到</p>
                        <span>请等待组织者揭晓，不会接受超时答案</span>
                      </div>
                    )}
                  {data.riddle.status === "answering" && data.riddle.own && (
                    <div className="answer-wait">
                      <CheckCircle2 />
                      <p>答案已锁定，等待揭晓</p>
                      <span>每题仅记录一次，结果与得分暂不提前公开</span>
                    </div>
                  )}
                  {data.riddle.status === "closed" && (
                    <div className="answer-wait">
                      <Hourglass />
                      <p>作答已截止，等待揭晓接收人</p>
                      <span>
                        {data.riddle.own
                          ? "你的答案已锁定"
                          : "本题未作答，得分按 0 处理"}
                      </span>
                    </div>
                  )}
                  {data.riddle.status === "revealed" &&
                    data.riddle.card.recipientName && (
                      <div className="riddle-reveal">
                        <span>这句欣赏写给</span>
                        <div>
                          <Avatar
                            name={data.riddle.card.recipientName}
                            size={58}
                          />
                          <h3>{data.riddle.card.recipientName}</h3>
                        </div>
                        {data.riddle.own ? (
                          <p>
                            {data.riddle.own.correct ? (
                              <CheckCircle2 />
                            ) : (
                              <XCircle />
                            )}
                            本题得分 +{data.riddle.own.score ?? 0}
                          </p>
                        ) : (
                          <p>本题未作答 · +0</p>
                        )}
                      </div>
                    )}
                </>
              )}
            </section>
          )}

          {data.phase === "predict" && (
            <section className="play-stage predict-stage game-panel">
              <div className="stage-heading">
                <span className="stage-index">02</span>
                <div>
                  <h2>全民预言家</h2>
                  <p>
                    从已审核关键词中选 3 个不同标签，预测哪些会进入 Top
                    5（含并列）。
                  </p>
                </div>
              </div>
              {!data.predict?.available ? (
                <EmptyState
                  dark
                  title="关键词暂未开放"
                  description="未发布或候选不足 5 个时不能开考；请等待组织者完成审核。"
                />
              ) : (
                <>
                  <div
                    className="prediction-picks"
                    aria-label="我的三个预言词位"
                  >
                    {[0, 1, 2].map(index => (
                      <div className={picks[index] ? "filled" : ""} key={index}>
                        <span>词位 {index + 1}</span>
                        <strong>{picks[index] ?? "待选择"}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="keyword-grid" aria-label="候选关键词">
                    {data.predict.options.map(keyword => {
                      const active = picks.includes(keyword);
                      return (
                        <button
                          key={keyword}
                          aria-pressed={active}
                          className={`keyword-choice ${active ? "selected" : ""}`}
                          disabled={prediction.isPending}
                          onClick={() =>
                            setPicks(current =>
                              active
                                ? current.filter(pick => pick !== keyword)
                                : current.length < 3
                                  ? [...current, keyword]
                                  : current
                            )
                          }
                        >
                          <strong>{keyword}</strong>
                          <small>
                            {active ? "已选入我的预言" : "选择这个关键词"}
                          </small>
                          {active && <Check size={17} />}
                        </button>
                      );
                    })}
                  </div>
                  <div className="stage-action">
                    <span>已选择 {picks.length} / 3 · 不显示词频</span>
                    <button
                      className="gold-button"
                      disabled={
                        picks.length !== 3 ||
                        new Set(picks).size !== 3 ||
                        prediction.isPending
                      }
                      onClick={() => prediction.mutate({ picks })}
                    >
                      <Send size={17} />
                      {prediction.isPending
                        ? "正在保存…"
                        : data.predict.own
                          ? "更新我的预言"
                          : "提交我的预言"}
                    </button>
                  </div>
                </>
              )}
            </section>
          )}

          {data.phase === "predict-reveal" && (
            <section className="play-stage centered-stage">
              <Hourglass className="stage-icon" />
              <h2>关键词 Top 5 正在揭晓</h2>
              <p>
                第五名同频并列会全部命中，因此最终命中词可能超过 5
                个。大屏与成员端都不公开单个标签频次。
              </p>
              {data.predict?.own ? (
                <div className="result-ticket">
                  <span>我的预言</span>
                  <strong>{data.predict.own.picks.join(" · ")}</strong>
                  {data.predict.own.score !== null ? (
                    <>
                      <b>
                        命中 {data.predict.own.hitCount} 个 · 预言得分 +
                        {data.predict.own.score}
                      </b>
                      <small>每命中 100；三个全中额外 300</small>
                    </>
                  ) : (
                    <small>已保存，等待结算</small>
                  )}
                </div>
              ) : (
                <EmptyState
                  dark
                  title="本场未提交预言"
                  description="未提交按 0 分处理，不会生成替代预言。"
                />
              )}
            </section>
          )}

          {data.phase === "match" && (
            <section className="play-stage match-stage game-panel">
              <div className="match-heading">
                <div className="stage-heading">
                  <span className="stage-index">03</span>
                  <div>
                    <h2>欣赏连连看</h2>
                    <p>
                      左列是你本人收到的全部欣赏话；右列只有本题组署名候选与“匿名”。
                    </p>
                  </div>
                </div>
                <div
                  className={`match-clock ${secondsLeft <= 15 && match?.active && !match.finished ? "urgent" : ""}`}
                >
                  <Clock3 />
                  <strong>
                    {match?.active
                      ? `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`
                      : "--:--"}
                  </strong>
                </div>
              </div>
              {!match?.active ? (
                <EmptyState
                  dark
                  title="全场统一计时尚未开始"
                  description="筹备不等于开考；启动后刷新、切页和重开都不会延长 120 秒。"
                />
              ) : match.cards.length === 0 ? (
                <EmptyState
                  dark
                  title="你本人没有收到欣赏卡"
                  description="0 卡正常结束，不生成替代题目，也不获得全部一次连对奖励。"
                />
              ) : (
                <>
                  <div className="match-progress">
                    <span>
                      已连对 {match.cards.filter(card => card.solved).length} /{" "}
                      {match.cards.length}
                    </span>
                    <span>本场得分 {match.totalScore}</span>
                  </div>
                  <MatchBoard
                    cards={match.cards}
                    candidates={match.candidates}
                    disabled={match.finished || matchRemainingMs <= 0}
                    pending={attempt.isPending}
                    onAttempt={(nominationId, choice) =>
                      attempt.mutate({ nominationId, choice })
                    }
                  />
                  {!match.finished && (
                    <button
                      className="outline-button finish-match"
                      disabled={finish.isPending || matchRemainingMs <= 0}
                      onClick={() => finish.mutate()}
                    >
                      <Link2 size={17} />
                      {finish.isPending ? "正在结算…" : "主动交卷并结算"}
                    </button>
                  )}
                  {match.finished && (
                    <div className="match-result">
                      <Trophy />
                      <strong>
                        {match.finishReason === "timeout"
                          ? "时间到"
                          : match.finishReason === "early"
                            ? "已主动交卷"
                            : "本场已结算"}{" "}
                        · {match.totalScore} 分
                      </strong>
                      {match.bonus > 0 && (
                        <span>本人全部卡均一次连对，额外 +{match.bonus}</span>
                      )}
                    </div>
                  )}
                </>
              )}
            </section>
          )}
          {data.phase === "collect" && (
            <footer className="participant-footer">
              <p>愿每一份真诚，都有温暖回声</p>
              <span>明日之星 · {PHASE_LABELS[data.phase]}</span>
            </footer>
          )}
        </>
      )}
    </PageShell>
  );
}
