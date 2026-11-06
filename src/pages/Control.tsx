import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Clock3,
  Download,
  FileJson,
  Gauge,
  History,
  ListChecks,
  Medal,
  MonitorUp,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Trophy,
} from "lucide-react";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { LoadingPage, PageShell } from "@/components/Layout";
import { EmptyState } from "@/components/EmptyState";
import { CollapsibleReason } from "@/components/CollapsibleReason";
import { Avatar } from "@/components/Avatar";
import { useViewer } from "@/lib/viewer";
import { downloadText, errorMessage, useNow } from "@/lib/interaction";
import { PHASES, PHASE_LABELS } from "@contracts/constants";
import { screenPath } from "@contracts/screen";

type ControlTab = "prepare" | "riddle" | "predict" | "match" | "scores";

export default function Control() {
  const { viewer, isLoading, logout } = useViewer();
  const utils = trpc.useUtils();
  const control = trpc.control.state.useQuery(undefined, {
    enabled: viewer?.role === "organizer",
    refetchInterval: 1500,
    retry: false,
  });
  const [tab, setTab] = useState<ControlTab>("prepare");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [keywordError, setKeywordError] = useState("");
  const [modal, setModal] = useState<
    "end-collect" | "clear-trial" | "publish" | null
  >(null);
  const [confirmation, setConfirmation] = useState("");
  const [recipientId, setRecipientId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [cardStatus, setCardStatus] = useState<
    "all" | "unused" | "used" | "selected"
  >("all");
  const [mergeSource, setMergeSource] = useState("");
  const [mergeTarget, setMergeTarget] = useState("");
  const now = useNow(250);
  const data = control.data;
  const refresh = async () => {
    await utils.control.state.invalidate();
  };
  const succeed = (text: string) => async () => {
    setMessage(text);
    setError("");
    setModal(null);
    setConfirmation("");
    await refresh();
  };
  const fail = (cause: unknown) => {
    setError(errorMessage(cause));
    setMessage("");
  };
  const advance = trpc.control.advance.useMutation({
    onSuccess: async result => {
      await succeed(result.message)();
    },
    onError: fail,
  });
  const endCollect = trpc.control.endCollect.useMutation({
    onSuccess: succeed("收集已截止，正式卡快照已固定；尚未开考"),
    onError: fail,
  });
  const setMode = trpc.control.setGameMode.useMutation({
    onSuccess: succeed("运行模式已切换，成绩仍按 run 隔离"),
    onError: fail,
  });
  const generate = trpc.control.generateKeywords.useMutation({
    onSuccess: async result => {
      setMessage(
        result.configured
          ? "整组生成已启动；失败时可整批重试"
          : "LLM 尚未配置：已保留真实集成与待生成状态"
      );
      setError("");
      setKeywordError("");
      await refresh();
    },
    onError: cause => {
      fail(cause);
      setKeywordError(errorMessage(cause));
    },
  });
  const copyKeywords = trpc.control.copyKeywords.useMutation({
    onSuccess: succeed("已复制为新修订稿，当前发布版未被覆盖"),
    onError: fail,
  });
  const mergeKeywords = trpc.control.mergeKeywords.useMutation({
    onSuccess: succeed("标签已按全部出现合并并去重"),
    onError: fail,
  });
  const publish = trpc.control.publishKeywords.useMutation({
    onSuccess: succeed("关键词版本已发布并绑定本场快照"),
    onError: fail,
  });
  const selectRiddle = trpc.control.selectRiddle.useMutation({
    onSuccess: succeed("已指定下一张未用正式卡，谜面尚未开始计时"),
    onError: fail,
  });
  const startAnswer = trpc.control.startRiddleAnswer.useMutation({
    onSuccess: succeed("谜面已展示，服务端 30 秒计时开始"),
    onError: fail,
  });
  const closeAnswer = trpc.control.closeRiddleAnswer.useMutation({
    onSuccess: succeed("本题作答已截止，可手动揭晓被欣赏人"),
    onError: fail,
  });
  const reveal = trpc.control.revealRiddle.useMutation({
    onSuccess: succeed("已揭晓被欣赏人，原题已标记为已用"),
    onError: fail,
  });
  const startMatch = trpc.control.startMatch.useMutation({
    onSuccess: succeed("全场统一 120 秒已启动；刷新不会延长"),
    onError: fail,
  });
  const clearTrial = trpc.control.clearTrial.useMutation({
    onSuccess: succeed("当前试玩记录与得分已清除；快照、锁和关键词版本保留"),
    onError: fail,
  });
  const exportJson = trpc.control.export.useQuery(
    { format: "json" },
    { enabled: false }
  );
  const exportCsv = trpc.control.export.useQuery(
    { format: "csv" },
    { enabled: false }
  );

  const phase = data?.phase;
  // A real server phase transition selects its workspace; polling alone does not.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!phase) return;
    if (phase === "collect" || phase === "prepare") setTab("prepare");
    else if (phase === "riddle") setTab("riddle");
    else if (phase === "predict" || phase === "predict-reveal")
      setTab("predict");
    else if (phase === "match") setTab("match");
  }, [phase]);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        event.code !== "Space" ||
        event.repeat ||
        modal ||
        target?.matches(
          "input, textarea, select, button, [contenteditable=true]"
        )
      )
        return;
      event.preventDefault();
      if (!advance.isPending && data?.phase !== "collect") advance.mutate();
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  });
  useEffect(() => {
    if (!modal) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setModal(null);
        setConfirmation("");
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [modal]);

  const filteredCards = useMemo(
    () =>
      (data?.riddle.cards ?? []).filter(card => {
        if (recipientId !== null && card.recipientId !== recipientId)
          return false;
        if (cardStatus === "unused" && card.used) return false;
        if (cardStatus === "used" && !card.used) return false;
        if (cardStatus === "selected" && !card.selected) return false;
        const query = search.trim().toLowerCase();
        return (
          !query ||
          card.reason.toLowerCase().includes(query) ||
          card.recipientName.toLowerCase().includes(query) ||
          String(card.id).includes(query)
        );
      }),
    [data?.riddle.cards, recipientId, cardStatus, search]
  );

  if (isLoading) return <LoadingPage />;
  if (!viewer || viewer.role !== "organizer")
    return (
      <PageShell viewer={viewer} onLogout={logout}>
        <div className="gate-panel">
          <ShieldCheck />
          <h1>组织者专属中控</h1>
          <p>普通成员的管理请求会由服务端直接拒绝。</p>
          <Link className="gold-button" to="/">
            返回登录
          </Link>
        </div>
      </PageShell>
    );
  const nextLabel = !data
    ? "推进"
    : data.phase === "prepare"
      ? "进入真心话抢答"
      : data.phase === "riddle"
        ? "结束真心话并进入预言"
        : data.phase === "predict"
          ? "截止预言并结算"
          : data.phase === "predict-reveal"
            ? data.step < data.predict.top.length
              ? `揭晓下一个（${data.step + 1}/${data.predict.top.length}）`
              : "进入连连看筹备"
            : data.phase === "match"
              ? "结束连连看并进入正式排行"
              : data.phase === "rank"
                ? "推进正式排行／颁奖"
                : data.phase === "award"
                  ? "推进颁奖"
                  : "顺序推进";
  const matchSeconds = data?.match.endsAt
    ? Math.max(0, Math.ceil((data.match.endsAt.getTime() - now) / 1000))
    : 0;
  const runExport = async (format: "json" | "csv") => {
    const result = await (format === "json"
      ? exportJson.refetch()
      : exportCsv.refetch());
    if (result.data)
      downloadText(result.data.filename, result.data.content, result.data.mime);
    if (result.error) setError(errorMessage(result.error));
  };
  return (
    <PageShell viewer={viewer} onLogout={logout} className="control-shell">
      <div className="control-heading">
        <div>
          <p className="eyebrow left">CEREMONY CONTROL</p>
          <h1>组织者中控</h1>
          <p>固定顺序、真实快照与服务端计时；筹备不等于开考。</p>
        </div>
        <div className="control-tools">
          <span
            className={`mode-badge ${data?.gameMode === "trial" ? "trial" : "official"}`}
          >
            {data?.gameMode === "trial" ? "试玩演练" : "正式成绩"}
          </span>
          <Link className="outline-button" to={screenPath(viewer.districtId)} target="_blank">
            <MonitorUp size={17} />
            打开大屏
          </Link>
        </div>
      </div>
      {message && (
        <p className="control-message success">
          <Check size={17} />
          {message}
        </p>
      )}
      {error && (
        <p className="control-message error">
          <AlertTriangle size={17} />
          {error}
        </p>
      )}
      {!data ? (
        <div className="stage-loading light">
          <Gauge />
          <p>正在读取典礼状态</p>
        </div>
      ) : (
        <>
          <section className="control-status-grid">
            <div>
              <span>当前环节</span>
              <strong>{PHASE_LABELS[data.phase]}</strong>
              <small>状态版本 #{data.revision}</small>
            </div>
            <div>
              <span>已提交人数</span>
              <strong>
                {data.stats.submitted}
                <small> / {data.stats.total}</small>
              </strong>
              <small>提交锁保持不动</small>
            </div>
            <div>
              <span>正式欣赏卡</span>
              <strong>
                {data.stats.cards}
                <small> 句</small>
              </strong>
              <small>
                {data.snapshot
                  ? `快照 #${data.snapshot.id} 已固定`
                  : "尚未截止"}
              </small>
            </div>
            <div>
              <span>真心话题库</span>
              <strong>
                {data.riddle.usedCount}
                <small> / {data.riddle.cards.length}</small>
              </strong>
              <small>全部正式卡 · 含匿名</small>
            </div>
          </section>
          <section className="phase-console">
            <div className="phase-track">
              {PHASES.map((phase, index) => (
                <div
                  key={phase}
                  className={`${phase === data.phase ? "current" : ""} ${PHASES.indexOf(data.phase) > index ? "past" : ""}`}
                >
                  <span>
                    {PHASES.indexOf(data.phase) > index ? (
                      <Check size={14} />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <strong>{PHASE_LABELS[phase]}</strong>
                </div>
              ))}
            </div>
            <div className="advance-console">
              <div>
                <span className="keyboard-key">Space</span>
                <p>只能按固定顺序推进，不再提供跳关或全场 reset</p>
              </div>
              {data.phase !== "collect" && (
                <button
                  className="gold-button advance-button"
                  disabled={advance.isPending}
                  onClick={() => advance.mutate()}
                >
                  {advance.isPending ? "推进中…" : nextLabel}
                  <ArrowRight size={19} />
                </button>
              )}
            </div>
          </section>
          <nav className="control-tabs" aria-label="中控工作区">
            {(["prepare", "riddle", "predict", "match", "scores"] as const).map(
              item => (
                <button
                  className={tab === item ? "active" : ""}
                  key={item}
                  onClick={() => setTab(item)}
                >
                  {
                    {
                      prepare: "筹备与截止",
                      riddle: "真心话",
                      predict: "关键词与预言",
                      match: "连连看",
                      scores: "成绩与审计",
                    }[item]
                  }
                </button>
              )
            )}
          </nav>

          {tab === "prepare" && (
            <section className="control-panel control-workspace">
              <div className="section-title">
                <div>
                  <ListChecks size={19} />
                  <h2>
                    {data.phase === "collect" ? "结束欣赏收集" : "现场筹备"}
                  </h2>
                </div>
                <span>
                  {data.gameMode === "trial" ? "试玩隔离开启" : "正式成绩模式"}
                </span>
              </div>
              {data.phase === "collect" ? (
                <div className="collection-close">
                  <h3>截止后，新增、草稿提交和正式稿修改都会关闭</h3>
                  <p>
                    将当前 {data.stats.cards}{" "}
                    张正式卡原位固定为不可变快照。此操作不会开始任何游戏，也不会清除草稿或提交锁。
                  </p>
                  <button
                    className="gold-button"
                    onClick={() => setModal("end-collect")}
                  >
                    结束欣赏收集并进入筹备
                    <ArrowRight size={17} />
                  </button>
                </div>
              ) : (
                <>
                  <div className="prepare-grid">
                    <div>
                      <span>正式卡快照</span>
                      <strong>#{data.snapshot?.id ?? "—"}</strong>
                      <small>
                        {data.snapshot?.cardCount ?? 0} 张 · 永久保留
                      </small>
                    </div>
                    <div>
                      <span>当前运行区</span>
                      <strong>
                        {data.gameMode === "trial" ? "试玩演练" : "正式成绩"}
                      </strong>
                      <small>run #{data.runId ?? "—"}</small>
                    </div>
                    <div>
                      <span>关键词版本</span>
                      <strong>
                        {data.keywords.publishedVersion
                          ? `V${data.keywords.publishedVersion}`
                          : "未发布"}
                      </strong>
                      <small>{data.keywords.candidates.length} 个候选</small>
                    </div>
                  </div>
                  {data.phase === "prepare" && (
                    <div className="mode-switch">
                      <div>
                        <strong>成绩模式</strong>
                        <p>
                          今天先试玩；明天切换到正式成绩。切换只在筹备状态开放。
                        </p>
                      </div>
                      <button
                        className="outline-button"
                        disabled={
                          data.gameMode === "trial" || setMode.isPending
                        }
                        onClick={() => setMode.mutate({ mode: "trial" })}
                      >
                        试玩演练
                      </button>
                      <button
                        className="gold-button"
                        disabled={
                          data.gameMode === "official" || setMode.isPending
                        }
                        onClick={() => setMode.mutate({ mode: "official" })}
                      >
                        正式成绩
                      </button>
                    </div>
                  )}
                </>
              )}
              <KeywordWorkspace
                data={data}
                mergeSource={mergeSource}
                setMergeSource={setMergeSource}
                mergeTarget={mergeTarget}
                setMergeTarget={setMergeTarget}
                onGenerate={() => {
                  setKeywordError("");
                  generate.mutate({ onlyFailed: false });
                }}
                generating={generate.isPending}
                error={keywordError}
                phase={data.phase}
                snapshotReady={Boolean(data.snapshot)}
                onGoPrepare={() => setTab("prepare")}
                onCopy={() => copyKeywords.mutate()}
                onMerge={() =>
                  mergeKeywords.mutate({
                    source: mergeSource,
                    target: mergeTarget,
                  })
                }
                onRename={(source, target) =>
                  mergeKeywords.mutate({ source, target })
                }
                onPublish={() => setModal("publish")}
              />
            </section>
          )}

          {tab === "riddle" && (
            <>
              <LiveCardsPanel cards={data.liveCards} snapshot={data.snapshot} />
              {data.snapshot && (
                <section className="control-panel control-workspace">
                  <div className="section-title">
                    <div>
                      <ListChecks size={19} />
                      <h2>真心话固定快照题库</h2>
                    </div>
                    <span>
                      {data.riddle.readOnly
                        ? "环节已结束 · 题库只读"
                        : "猜被欣赏人 · 不猜作者"}
                    </span>
                  </div>
                  <div className="riddle-live-actions">
                    <button
                      className="outline-button"
                      disabled={data.riddle.readOnly || selectRiddle.isPending}
                      onClick={() =>
                        selectRiddle.mutate({ nominationId: null })
                      }
                    >
                      <RefreshCw size={16} />
                      随机未用
                    </button>
                    <button
                      className="gold-button"
                      disabled={
                        data.riddle.readOnly ||
                        data.riddle.state?.status !== "ready" ||
                        startAnswer.isPending
                      }
                      onClick={() => startAnswer.mutate()}
                    >
                      <Play size={16} />
                      展示谜面并开考
                    </button>
                    <button
                      className="outline-button"
                      disabled={
                        data.riddle.state?.status !== "answering" ||
                        closeAnswer.isPending
                      }
                      onClick={() => closeAnswer.mutate()}
                    >
                      提前结束作答
                    </button>
                    <button
                      className="outline-button"
                      disabled={
                        data.riddle.state?.status !== "closed" ||
                        reveal.isPending
                      }
                      onClick={() => reveal.mutate()}
                    >
                      揭晓被欣赏人
                    </button>
                  </div>
                  <div className="riddle-console">
                    <div>
                      <span>当前状态</span>
                      <strong>{data.riddle.state?.status ?? "idle"}</strong>
                      <small>
                        {data.riddle.state?.card?.reason
                          ? "谜面已展示"
                          : "尚未展示谜面"}
                      </small>
                    </div>
                    <div className="control-countdown">
                      <span>服务端剩余</span>
                      <strong>
                        {Math.ceil(
                          (data.riddle.state?.remainingMs ?? 0) / 1000
                        )}
                        s
                      </strong>
                      <small>
                        已收到 {data.riddle.state?.answerCount ?? 0} 份答案
                      </small>
                    </div>
                  </div>
                  <div className="riddle-library-layout">
                    <aside className="recipient-filter">
                      <div className="recipient-filter-heading">
                        <strong>接收人</strong>
                        <span>真实卡数</span>
                      </div>
                      <div className="recipient-filter-list">
                        <button
                          className={recipientId === null ? "selected" : ""}
                          onClick={() => setRecipientId(null)}
                        >
                          全部<span>{data.riddle.cards.length}</span>
                        </button>
                        {data.riddle.recipients.map(member => (
                          <button
                            key={member.id}
                            className={
                              recipientId === member.id ? "selected" : ""
                            }
                            ref={node => {
                              if (recipientId === member.id)
                                node?.scrollIntoView({
                                  block: "nearest",
                                  inline: "center",
                                });
                            }}
                            onClick={() => setRecipientId(member.id)}
                          >
                            {member.name}
                            <span>{member.count}</span>
                          </button>
                        ))}
                      </div>
                      <small>点击人名只看写给 TA 的卡</small>
                    </aside>
                    <div className="riddle-library">
                      <div className="filter-row">
                        <label>
                          <Search size={16} />
                          <input
                            value={search}
                            onChange={event => setSearch(event.target.value)}
                            placeholder="搜索正文、接收人或卡号"
                          />
                        </label>
                        <select
                          value={cardStatus}
                          onChange={event =>
                            setCardStatus(
                              event.target.value as typeof cardStatus
                            )
                          }
                        >
                          <option value="all">全部状态</option>
                          <option value="unused">未使用</option>
                          <option value="used">已使用</option>
                          <option value="selected">当前题</option>
                        </select>
                        <button
                          className="outline-button"
                          onClick={() => {
                            setSearch("");
                            setRecipientId(null);
                            setCardStatus("all");
                          }}
                        >
                          重置筛选
                        </button>
                      </div>
                      <p className="filter-result">
                        显示 {filteredCards.length} / {data.riddle.cards.length}{" "}
                        张；重置不会清除已用状态
                      </p>
                      {filteredCards.length === 0 ? (
                        <EmptyState
                          title="没有符合筛选的正式卡"
                          description="不会生成虚构替代题，可调整组合筛选。"
                        />
                      ) : (
                        <div className="control-card-list riddle-card-grid">
                          {filteredCards.map(card => (
                            <article
                              key={card.id}
                              className={`${card.used ? "used" : ""} ${card.selected ? "selected" : ""}`}
                            >
                              <header>
                                <span>
                                  #{card.id} · 写给 {card.recipientName}
                                </span>
                                <span>
                                  {card.used
                                    ? "已用"
                                    : card.selected
                                      ? "当前题"
                                      : card.anonymous
                                        ? "匿名卡"
                                        : "署名卡"}
                                </span>
                              </header>
                              <CollapsibleReason text={card.reason} />
                              <button
                                className="outline-button full-button"
                                disabled={
                                  data.riddle.readOnly ||
                                  card.used ||
                                  selectRiddle.isPending
                                }
                                onClick={() =>
                                  selectRiddle.mutate({ nominationId: card.id })
                                }
                              >
                                {card.used ? "原位置灰禁选" : "指定为下一题"}
                              </button>
                            </article>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              )}
            </>
          )}

          {tab === "predict" && (
            <>
              <KeywordWorkspace
                data={data}
                mergeSource={mergeSource}
                setMergeSource={setMergeSource}
                mergeTarget={mergeTarget}
                setMergeTarget={setMergeTarget}
                onGenerate={() => {
                  setKeywordError("");
                  generate.mutate({ onlyFailed: false });
                }}
                generating={generate.isPending}
                error={keywordError}
                phase={data.phase}
                snapshotReady={Boolean(data.snapshot)}
                onGoPrepare={() => setTab("prepare")}
                onCopy={() => copyKeywords.mutate()}
                onMerge={() =>
                  mergeKeywords.mutate({
                    source: mergeSource,
                    target: mergeTarget,
                  })
                }
                onRename={(source, target) =>
                  mergeKeywords.mutate({ source, target })
                }
                onPublish={() => setModal("publish")}
              />
              <section className="control-panel predict-console">
                <div className="section-title">
                  <div>
                    <Sparkles size={19} />
                    <h2>全民预言家</h2>
                  </div>
                  <span>
                    {data.predict.boundVersion
                      ? `运行区绑定 V${data.predict.boundVersion}`
                      : "尚未开考"}
                  </span>
                </div>
                <p>
                  成员选 3 个不同关键词；每个命中 Top 5 加 100，三个全中额外加
                  300。第五名同频并列全部计入。
                </p>
                {data.predict.top.length > 0 ? (
                  <div className="control-keyword-top">
                    {data.predict.top.map((item, index) => (
                      <div key={item.keyword}>
                        <span>{index + 1}</span>
                        <strong>{item.keyword}</strong>
                        <b>{item.count} 卡</b>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="尚未产生命中榜"
                    description="未发布或候选不足 5 个时不开考、不编造。"
                  />
                )}
              </section>
            </>
          )}

          {tab === "match" && (
            <section className="control-panel control-workspace">
              <div className="section-title">
                <div>
                  <Clock3 size={19} />
                  <h2>欣赏连连看</h2>
                </div>
                <span>本人全部正式卡 · 含匿名欣赏</span>
              </div>
              <div className="match-start-panel">
                <div className="match-clock-large">
                  {data.match.endsAt
                    ? `${Math.floor(matchSeconds / 60)}:${String(matchSeconds % 60).padStart(2, "0")}`
                    : "--:--"}
                </div>
                <div>
                  <h3>
                    {data.match.endsAt ? "统一计时已启动" : "全场计时未启动"}
                  </h3>
                  <p>
                    每卡第 1／2／3 次连对得 100／80／60，第 4 次起
                    0；全部一次连对额外 +300，0 卡无奖励。
                  </p>
                </div>
                <button
                  className="gold-button"
                  disabled={Boolean(data.match.endsAt) || startMatch.isPending}
                  onClick={() => startMatch.mutate()}
                >
                  {data.match.endsAt ? "120 秒已启动" : "启动全场 120 秒"}
                </button>
              </div>
              <div className="match-control-note">
                刷新、切页和重开都读取同一服务端 endsAt，不再提供加时。
              </div>
            </section>
          )}

          {tab === "scores" && (
            <div className="control-columns">
              <section className="control-panel">
                <div className="section-title">
                  <div>
                    <Trophy size={19} />
                    <h2>
                      {data.gameMode === "trial"
                        ? "试玩成绩（隔离）"
                        : "正式成绩"}
                    </h2>
                  </div>
                  <span>{data.scores.length} 条</span>
                </div>
                {data.scores.length === 0 ? (
                  <p className="panel-empty">当前 run 尚无得分</p>
                ) : (
                  <div className="score-table">
                    <div className="score-row score-head">
                      <span>成员</span>
                      <span>预言</span>
                      <span>抢答</span>
                      <span>连看</span>
                      <span>总分</span>
                    </div>
                    {data.scores.map(score => (
                      <div className="score-row" key={score.memberId}>
                        <strong>{score.name}</strong>
                        <span>{score.predict}</span>
                        <span>{score.riddle}</span>
                        <span>{score.match}</span>
                        <b>{score.total}</b>
                      </div>
                    ))}
                  </div>
                )}
              </section>
              <div className="control-side">
                <section className="control-panel">
                  <div className="section-title">
                    <div>
                      <Medal size={19} />
                      <h2>导出正式数据</h2>
                    </div>
                  </div>
                  <p>导出含真实作者的审计数据，请妥善保管。</p>
                  <div className="export-actions">
                    <button
                      className="outline-button"
                      onClick={() => void runExport("csv")}
                    >
                      <Download size={16} />
                      CSV
                    </button>
                    <button
                      className="outline-button"
                      onClick={() => void runExport("json")}
                    >
                      <FileJson size={16} />
                      JSON
                    </button>
                  </div>
                </section>
              </div>
            </div>
          )}
          {tab === "scores" && (
            <section className="control-panel history-panel">
              <div className="section-title">
                <div>
                  <History size={19} />
                  <h2>组织者操作审计</h2>
                </div>
                <span>最近 20 条</span>
              </div>
              {data.audits.length === 0 ? (
                <p className="panel-empty">尚无操作记录</p>
              ) : (
                <div className="audit-log-list">
                  {data.audits.map(log => (
                    <div key={log.id}>
                      <span>#{log.id}</span>
                      <strong>
                        {log.actorName} · {log.action}
                      </strong>
                      <code>{JSON.stringify(log.details)}</code>
                      <time>
                        {new Date(log.createdAt).toLocaleString("zh-CN")}
                      </time>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
          {data.canClearTrial && (
            <section className="danger-zone trial-clear-zone">
              <div>
                <Trash2 size={22} />
                <div>
                  <h2>清除本轮试玩</h2>
                  <p>
                    仅删除当前事件、当前试玩 run
                    的预言、抢答、连线和得分；永久保留正式卡、成员、提交锁、快照和关键词版本。
                  </p>
                </div>
              </div>
              <button
                className="danger-button"
                onClick={() => setModal("clear-trial")}
              >
                清除本轮试玩
              </button>
            </section>
          )}
        </>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={event => {
            if (event.target === event.currentTarget) {
              setModal(null);
              setConfirmation("");
            }
          }}
        >
          <div
            className={`confirm-modal ${modal === "clear-trial" ? "danger-modal" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
          >
            <AlertTriangle />
            <h2 id="confirm-title">
              {modal === "end-collect"
                ? "确认结束欣赏收集？"
                : modal === "clear-trial"
                  ? "二次确认：仅清除本轮试玩"
                  : "确认发布关键词版本？"}
            </h2>
            <p>
              {modal === "end-collect"
                ? "截止后不能新增、提交草稿或修改正式稿。将固定快照并进入筹备，不会开考。请输入「结束收集」。"
                : modal === "clear-trial"
                  ? "不会调用全场 reset，也不会重开收集。请输入「清除试玩」；正式成绩模式没有此入口。"
                  : "发布后将绑定当前快照供预言使用。发布前请确认整组标签已审核、候选不少于 5 个。"}
            </p>
            {modal !== "publish" && (
              <input
                autoFocus
                value={confirmation}
                onChange={event => setConfirmation(event.target.value)}
                placeholder={modal === "end-collect" ? "结束收集" : "清除试玩"}
              />
            )}
            <div>
              <button
                className="outline-button"
                onClick={() => {
                  setModal(null);
                  setConfirmation("");
                }}
              >
                取消
              </button>
              {modal === "end-collect" ? (
                <button
                  className="gold-button"
                  disabled={confirmation !== "结束收集" || endCollect.isPending}
                  onClick={() =>
                    endCollect.mutate({ confirmation: "结束收集" })
                  }
                >
                  确认截止
                </button>
              ) : modal === "clear-trial" ? (
                <button
                  className="danger-button"
                  disabled={confirmation !== "清除试玩" || clearTrial.isPending}
                  onClick={() =>
                    clearTrial.mutate({ confirmation: "清除试玩" })
                  }
                >
                  精确清除试玩
                </button>
              ) : (
                <button
                  className="gold-button"
                  disabled={publish.isPending}
                  onClick={() => publish.mutate()}
                >
                  确认发布
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

type KeywordData = RouterOutputs["control"]["state"];

function LiveCardsPanel({
  cards,
  snapshot,
}: {
  cards: KeywordData["liveCards"];
  snapshot: KeywordData["snapshot"];
}) {
  const [recipientId, setRecipientId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const recipients = useMemo(() => {
    const counts = new Map<
      number,
      { id: number; name: string; count: number }
    >();
    for (const card of cards) {
      const current = counts.get(card.recipientId);
      counts.set(card.recipientId, {
        id: card.recipientId,
        name: card.recipientName,
        count: (current?.count ?? 0) + 1,
      });
    }
    return [...counts.values()];
  }, [cards]);
  const filteredCards = useMemo(
    () =>
      cards.filter(card => {
        if (recipientId !== null && card.recipientId !== recipientId)
          return false;
        const query = search.trim().toLowerCase();
        return (
          !query ||
          card.reason.toLowerCase().includes(query) ||
          card.authorName.toLowerCase().includes(query) ||
          card.recipientName.toLowerCase().includes(query) ||
          String(card.id).includes(query)
        );
      }),
    [cards, recipientId, search]
  );
  return (
    <section className="control-panel live-cards-panel">
      <div className="section-title">
        <div>
          <ListChecks size={19} />
          <h2>已提交真心话（欣赏）</h2>
        </div>
        <span>{cards.length} 张实时稿</span>
      </div>
      <p className="live-cards-notice">
        {snapshot
          ? "这里始终读取当前正式卡；游戏仍只使用截止时固定的快照，之后的新卡或修改不会进入抢答。"
          : "收集中即可查看当前正式卡；这里仅供组织者审计，不是游戏快照，也不会让新卡提前进入抢答。"}
      </p>
      {cards.length === 0 ? (
        <EmptyState
          title="尚未提交真心话"
          description="正式提交后才会出现在这里，草稿不计入。"
        />
      ) : (
        <div className="riddle-library-layout live-cards-layout">
          <aside className="recipient-filter">
            <div className="recipient-filter-heading">
              <strong>接收人</strong>
              <span>实时卡数</span>
            </div>
            <div className="recipient-filter-list">
              <button
                className={recipientId === null ? "selected" : ""}
                onClick={() => setRecipientId(null)}
              >
                全部<span>{cards.length}</span>
              </button>
              {recipients.map(member => (
                <button
                  key={member.id}
                  className={recipientId === member.id ? "selected" : ""}
                  onClick={() => setRecipientId(member.id)}
                >
                  {member.name}
                  <span>{member.count}</span>
                </button>
              ))}
            </div>
            <small>点击人名只看写给 TA 的实时稿</small>
          </aside>
          <div className="riddle-library">
            <div className="filter-row">
              <label>
                <Search size={16} />
                <input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="搜索正文、作者、接收人或卡号"
                />
              </label>
              <button
                className="outline-button"
                onClick={() => {
                  setSearch("");
                  setRecipientId(null);
                }}
              >
                重置筛选
              </button>
            </div>
            <p className="filter-result">
              显示 {filteredCards.length} / {cards.length}{" "}
              张；作者与提交时间仅组织者可见
            </p>
            {filteredCards.length === 0 ? (
              <EmptyState
                title="没有符合筛选的实时稿"
                description="可调整搜索词或接收人筛选。"
              />
            ) : (
              <div className="control-card-list live-card-grid">
                {filteredCards.map(card => (
                  <article key={card.id}>
                    <header>
                      <span>#{card.id}</span>
                      <span>{card.anonymous ? "匿名展示" : "署名展示"}</span>
                    </header>
                    <CollapsibleReason text={card.reason} />
                    <div>
                      <span>
                        <Avatar name={card.authorName} size={28} />
                        {card.authorName}
                      </span>
                      <ArrowRight size={14} />
                      <span>
                        <Avatar name={card.recipientName} size={28} />
                        {card.recipientName}
                      </span>
                    </div>
                    <footer>
                      <span>
                        提交于{" "}
                        {new Date(card.submittedAt).toLocaleString("zh-CN", {
                          hour12: false,
                        })}
                      </span>
                    </footer>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function KeywordWorkspace({
  data,
  mergeSource,
  setMergeSource,
  mergeTarget,
  setMergeTarget,
  onGenerate,
  generating,
  error,
  phase,
  snapshotReady,
  onGoPrepare,
  onCopy,
  onMerge,
  onRename,
  onPublish,
}: {
  data: KeywordData;
  error: string;
  phase: KeywordData["phase"];
  snapshotReady: boolean;
  onGoPrepare: () => void;
  mergeSource: string;
  setMergeSource: (value: string) => void;
  mergeTarget: string;
  setMergeTarget: (value: string) => void;
  onGenerate: () => void;
  generating: boolean;
  onCopy: () => void;
  onMerge: () => void;
  onRename: (source: string, target: string) => void;
  onPublish: () => void;
}) {
  const [labelError, setLabelError] = useState("");
  const version = data.keywords.version;
  const precondition =
    phase === "collect"
      ? "结束收集并固定快照后可生成整组关键词"
      : !snapshotReady
        ? "正式卡快照不存在，请先在筹备／截止区固定快照"
        : "";
  const busy = generating || Boolean(version?.generating);
  const rename = (source: string, target: string, input: HTMLInputElement) => {
    const label = target.trim();
    if (label === source) return;
    if (!/^[\u4e00-\u9fff]{4}$/.test(label)) {
      setLabelError("标签必须是四个中文汉字；未保存本次输入");
      input.value = source;
      return;
    }
    setLabelError("");
    onRename(source, label);
  };
  return (
    <section className="control-panel keyword-workspace">
      <div className="section-title">
        <div>
          <Sparkles size={19} />
          <h2>全场关键词 · 整组审核</h2>
        </div>
        <span>
          {version
            ? `V${version.version} · ${version.status === "draft" ? "待审核" : "已发布"}`
            : "尚未生成"}
        </span>
      </div>
      <div className="keyword-batch-flow" aria-label="整组关键词生成流程">
        <span>完整快照</span>
        <i>→</i>
        <span>一次通读并全局归并</span>
        <i>→</i>
        <span>服务端按卡去重计频</span>
      </div>
      <p className="keyword-batch-description">
        建议形成 8–12
        个四字标签，证据不足允许更少。这里只审核整组标签与卡数，不展示逐卡评语、依据或失败卡；不会自动发布或开考。
      </p>
      <div className="keyword-actions">
        <button
          className="gold-button"
          disabled={busy || Boolean(precondition)}
          onClick={onGenerate}
        >
          {generating
            ? "正在提交整组请求…"
            : version?.generating
              ? "整组生成中…"
              : version?.statusCounts.failed
                ? "整批重试生成"
                : version
                  ? "重新整组生成"
                  : `汇总全部 ${data.snapshot?.cardCount ?? 0} 条并生成`}
        </button>
        {data.keywords.publishedVersion && !data.keywords.draftVersion && (
          <button className="outline-button" onClick={onCopy}>
            复制当前发布版修订
          </button>
        )}
        {data.keywords.draftVersion && (
          <button className="gold-button" disabled={busy} onClick={onPublish}>
            审核完成并发布
          </button>
        )}
      </div>
      {precondition && (
        <div className="keyword-precondition" role="note">
          <p>
            <AlertTriangle size={16} />
            {precondition}。此处只提供查看入口，不会自动截止或推进阶段。
          </p>
          <button className="outline-button" onClick={onGoPrepare}>
            查看筹备与截止
          </button>
        </div>
      )}
      {error && (
        <p className="control-message error keyword-local-error" role="alert">
          <AlertTriangle size={17} />
          生成请求未成功：{error}
        </p>
      )}
      {version && (
        <div className="keyword-persistence">
          <span>
            整批数据库状态：<b>待生成 {version.statusCounts.pending}</b>
            <b className="ok">成功 {version.statusCounts.ok}</b>
            <b className="failed">失败 {version.statusCounts.failed}</b>
          </span>
          <time>
            最近更新{" "}
            {new Date(version.lastUpdatedAt).toLocaleString("zh-CN", {
              hour12: false,
            })}
          </time>
        </div>
      )}
      {version?.batchError && (
        <p className="control-message error keyword-local-error" role="alert">
          <AlertTriangle size={17} />
          整批生成失败，可直接重试：{version.batchError}
        </p>
      )}
      {!data.keywords.llmConfigured && (
        <p className="config-warning">
          服务端待配置 LLM_API_KEY；真实 DeepSeek
          整组调用链已就绪，未生成任何示例标签。
        </p>
      )}
      {version && (
        <>
          <div className="keyword-group-summary">
            <span>
              完整快照<strong>{version.cardCount} 条</strong>
            </span>
            <span>
              规范标签<strong>{version.frequencies.length} 个</strong>
            </span>
            <span>
              统计方式<strong>每卡每词一次</strong>
            </span>
          </div>
          <div className="merge-bar">
            <select
              aria-label="需要合并的原标签"
              value={mergeSource}
              onChange={event => setMergeSource(event.target.value)}
              disabled={version.status !== "draft" || busy}
            >
              <option value="">选择要合并的原标签</option>
              {version.frequencies.map(item => (
                <option key={item.keyword} value={item.keyword}>
                  {item.keyword} · {item.count} 卡
                </option>
              ))}
            </select>
            <input
              aria-label="统一为四字标签"
              value={mergeTarget}
              onChange={event => setMergeTarget(event.target.value)}
              placeholder="合并成的四字中文标签"
              maxLength={4}
              disabled={version.status !== "draft" || busy}
            />
            <button
              className="outline-button"
              disabled={
                !mergeSource ||
                !/^[\u4e00-\u9fff]{4}$/.test(mergeTarget) ||
                version.status !== "draft" ||
                busy
              }
              onClick={onMerge}
            >
              合并并卡内去重
            </button>
          </div>
          {labelError && (
            <p className="form-error" role="alert">
              {labelError}
            </p>
          )}
          <div className="keyword-group-list">
            <div className="section-title">
              <div>
                <h3>整组关键词清单</h3>
              </div>
              <span>失焦保存改名 · 不展示逐卡评语</span>
            </div>
            {version.frequencies.length === 0 ? (
              <EmptyState
                title={
                  version.cardCount === 0
                    ? "快照为 0 卡"
                    : "暂无有足够证据的标签"
                }
                description={
                  version.cardCount === 0
                    ? "正常空状态，不生成标签或候选。"
                    : "可整批重新生成，不会为凑数虚构关键词。"
                }
              />
            ) : (
              version.frequencies.map(item => (
                <div className="keyword-group-row" key={item.keyword}>
                  <input
                    key={item.keyword}
                    defaultValue={item.keyword}
                    maxLength={4}
                    aria-label={`关键词 ${item.keyword} 改名`}
                    disabled={version.status !== "draft" || busy}
                    onBlur={event =>
                      rename(
                        item.keyword,
                        event.currentTarget.value,
                        event.currentTarget
                      )
                    }
                  />
                  <strong>
                    {item.count}
                    <small> 卡</small>
                  </strong>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </section>
  );
}
