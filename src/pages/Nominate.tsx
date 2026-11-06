import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { Check, CheckCheck, ChevronLeft, Eye, EyeOff, Info, LockKeyhole, PenLine, Pencil, Plus, Save, Send, Sparkles, Users, X } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { LoadingPage, PageShell } from "@/components/Layout";
import { Avatar } from "@/components/Avatar";
import { useViewer } from "@/lib/viewer";
import { errorMessage } from "@/lib/interaction";
import { MAX_REASON_LENGTH, unicodeLength } from "@contracts/constants";

type DraftCard = { reason: string; anonymous: boolean };
type CardMap = Record<number, DraftCard>;
type Confirmation =
  | { type: "remove"; id: number; name: string }
  | { type: "clear" }
  | { type: "submit" }
  | { type: "save-submitted" }
  | { type: "cancel-submitted" }
  | { type: "reload-submitted" }
  | null;

function cardMapFrom(cards: { recipientId: number; reason: string; anonymous?: boolean }[]): CardMap {
  return Object.fromEntries(cards.map((card) => [card.recipientId, { reason: card.reason, anonymous: Boolean(card.anonymous) }]));
}

function draftSignature(source: CardMap) {
  return JSON.stringify(Object.entries(source)
    .sort(([left], [right]) => Number(left) - Number(right))
    .map(([id, card]) => [Number(id), card.reason, card.anonymous]));
}

function payloadSignature(cards: { recipientId: number; reason: string; anonymous?: boolean }[]) {
  return draftSignature(cardMapFrom(cards.map((card) => ({ ...card, anonymous: Boolean(card.anonymous) }))));
}

function AutoGrowingTextarea({ value, onChange, placeholder, label }: { value: string; onChange: (value: string) => void; placeholder: string; label: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = "auto";
    ref.current.style.height = `${Math.min(ref.current.scrollHeight, 480)}px`;
  }, [value]);
  return <textarea
    ref={ref}
    value={value}
    onChange={(event) => onChange(event.target.value)}
    placeholder={placeholder}
    aria-label={label}
    rows={4}
  />;
}

function LongReason({ value }: { value: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = unicodeLength(value) > 280;
  return <div className="long-reason-wrap">
    <p className={`submitted-reason ${long && !expanded ? "collapsed" : ""}`}>{value}</p>
    {long && <button className="reason-expand" aria-expanded={expanded} onClick={() => setExpanded((current) => !current)}>{expanded ? "收起" : "展开全文"}</button>}
  </div>;
}

function ConfirmDialog({ confirmation, busy, onCancel, onConfirm }: { confirmation: Confirmation; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const cancel = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!confirmation) return;
    cancel.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
      if (event.key !== "Tab" || !dialog.current) return;
      const buttons = Array.from(dialog.current.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [confirmation, busy, onCancel]);
  if (!confirmation) return null;
  const type = confirmation.type;
  const content = type === "submit"
    ? { title: "确认正式提交", description: "正式提交后，在收集开放期间仍可修改；进入下一环节后将最终锁定。确定正式提交吗？", secondary: "取消", primary: "确定正式提交" }
    : type === "save-submitted"
      ? { title: "确认保存修改", description: "将更新本人正式提交内容，旧版本将被替换；收集开放期间仍可再次修改。请同时确认每张卡的匿名／署名设置。确定保存修改吗？", secondary: "返回检查", primary: "确认保存" }
      : type === "cancel-submitted"
        ? { title: "取消本次修改？", description: "未保存的修改将被丢弃，并恢复为当前正式提交内容。确定取消修改吗？", secondary: "继续修改", primary: "确定取消" }
        : type === "reload-submitted"
          ? { title: "重新读取正式稿？", description: "重新读取会丢弃当前未保存的编辑，并以云端最新正式稿替换。确定继续吗？", secondary: "保留当前编辑", primary: "重新读取" }
          : type === "clear"
            ? { title: "清空所有填写卡", description: "将移除本人当前选区的全部未提交填写卡。确定继续吗？", secondary: "取消", primary: "确定清空" }
            : { title: `移除对${confirmation.name}的填写`, description: "这张卡已有内容，移除后可在正式提交前重新选择并填写。确定移除吗？", secondary: "取消", primary: "确定移除" };
  return <div className="dialog-backdrop">
    <div ref={dialog} className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-description">
      <h2 id="confirm-title">{content.title}</h2>
      <p id="confirm-description">{content.description}</p>
      <div className="dialog-actions"><button ref={cancel} className="outline-button" onClick={onCancel} disabled={busy}>{content.secondary}</button><button className="gold-button" onClick={onConfirm} disabled={busy}>{busy ? "请稍候…" : content.primary}</button></div>
    </div>
  </div>;
}

export default function Nominate() {
  const { viewer, isLoading, logout } = useViewer();
  const utils = trpc.useUtils();
  const bootstrap = trpc.auth.bootstrap.useQuery({ districtId: viewer?.districtId }, { enabled: viewer?.role === "member" });
  const mine = trpc.nominate.mine.useQuery(undefined, { enabled: viewer?.role === "member", retry: false });
  const [cards, setCards] = useState<CardMap>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [editingSubmitted, setEditingSubmitted] = useState(false);
  const [revisionConflict, setRevisionConflict] = useState(false);
  const [reloading, setReloading] = useState(false);
  const initialized = useRef(false);
  const latestSignature = useRef("");
  const savedSignature = useRef("");
  const failedSignature = useRef("");
  const submittedSnapshot = useRef<CardMap>({});
  const editRevision = useRef("");
  const saveInFlight = useRef(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewerKey = viewer ? `${viewer.districtId}:${viewer.id}` : "";
  const previousViewerKey = useRef(viewerKey);

  const initializeFromMine = useCallback((data: NonNullable<typeof mine.data>) => {
    const initialCards = cardMapFrom(data.cards);
    const signature = draftSignature(initialCards);
    latestSignature.current = signature;
    savedSignature.current = signature;
    failedSignature.current = "";
    submittedSnapshot.current = initialCards;
    editRevision.current = data.revision;
    setCards(initialCards);
    setEditingSubmitted(false);
    setRevisionConflict(false);
    initialized.current = true;
  }, []);

  useEffect(() => {
    if (previousViewerKey.current === viewerKey) return;
    previousViewerKey.current = viewerKey;
    initialized.current = false;
    setCards({});
    setEditingSubmitted(false);
    setRevisionConflict(false);
    setConfirmation(null);
    setMessage("");
    setError("");
  }, [viewerKey]);

  useEffect(() => {
    if (!mine.data || initialized.current) return;
    initializeFromMine(mine.data);
  }, [mine.data, initializeFromMine]);

  const saveDraft = trpc.nominate.saveDraft.useMutation({
    onSuccess: async (_result, variables) => {
      const signature = payloadSignature(variables.cards);
      savedSignature.current = signature;
      setError("");
      await utils.nominate.mine.invalidate();
      if (latestSignature.current === signature) {
        failedSignature.current = "";
        setMessage("草稿已保存到云端，可刷新或重新登录继续书写");
      }
    },
    onError: (cause, variables) => {
      if (payloadSignature(variables.cards) !== latestSignature.current) return;
      failedSignature.current = latestSignature.current;
      setError(errorMessage(cause));
      setMessage("");
    },
  });
  const submit = trpc.nominate.submit.useMutation({
    onSuccess: async (result, variables) => {
      const submittedCards = cardMapFrom(variables.cards);
      const signature = draftSignature(submittedCards);
      submittedSnapshot.current = submittedCards;
      savedSignature.current = signature;
      latestSignature.current = signature;
      setCards(submittedCards);
      setConfirmation(null);
      setMessage(`已正式提交 ${result.count} 张欣赏卡，收集开放期间仍可修改`);
      setError("");
      await utils.nominate.mine.invalidate();
    },
    onError: (cause) => { setConfirmation(null); setError(errorMessage(cause)); setMessage(""); },
  });
  const updateSubmitted = trpc.nominate.updateSubmitted.useMutation({
    onSuccess: async (result, variables) => {
      saveInFlight.current = false;
      const nextCards = cardMapFrom(variables.cards);
      const signature = draftSignature(nextCards);
      submittedSnapshot.current = nextCards;
      savedSignature.current = signature;
      latestSignature.current = signature;
      editRevision.current = result.revision;
      setCards(nextCards);
      setEditingSubmitted(false);
      setRevisionConflict(false);
      setConfirmation(null);
      setMessage("修改已保存，仍保持已提交");
      setError("");
      await utils.nominate.mine.invalidate();
    },
    onError: (cause) => {
      saveInFlight.current = false;
      const reason = errorMessage(cause);
      setConfirmation(null);
      setRevisionConflict(reason.includes("另一处更新"));
      setError(reason);
      setMessage("");
    },
    onSettled: () => { saveInFlight.current = false; },
  });

  const members = useMemo(() => bootstrap.data?.members ?? [], [bootstrap.data]);
  const selected = members.filter((member) => cards[member.id]);
  const payloadFor = (source: CardMap) => members.filter((member) => source[member.id]).map((member) => ({ recipientId: member.id, reason: source[member.id].reason, anonymous: source[member.id].anonymous }));
  const payload = payloadFor(cards);
  const submitted = mine.data?.status === "submitted";
  const canSubmitDraft = !submitted && (mine.data?.canSubmit ?? false);
  const canEditSubmitted = submitted && (mine.data?.canEditSubmitted ?? false);
  const isSubmittedEditing = submitted && editingSubmitted;
  const canEditCards = canSubmitDraft || isSubmittedEditing;
  const busy = saveDraft.isPending || submit.isPending || updateSubmitted.isPending || reloading;
  const currentSignature = draftSignature(cards);
  const dirty = initialized.current && currentSignature !== savedSignature.current;

  useEffect(() => {
    latestSignature.current = currentSignature;
    if (!initialized.current || !canSubmitDraft || saveDraft.isPending || submit.isPending) return;
    if (currentSignature === savedSignature.current || currentSignature === failedSignature.current) return;
    setMessage("");
    setError("");
    const timer = setTimeout(() => {
      autoSaveTimer.current = null;
      if (latestSignature.current !== currentSignature) return;
      setMessage("正在自动保存…");
      saveDraft.mutate({ cards: payloadFor(cards) });
    }, 900);
    autoSaveTimer.current = timer;
    return () => {
      clearTimeout(timer);
      if (autoSaveTimer.current === timer) autoSaveTimer.current = null;
    };
  }, [cards, currentSignature, canSubmitDraft, members, saveDraft.isPending, submit.isPending]);

  const updateCard = (id: number, patch: Partial<DraftCard>) => setCards((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  const removeNow = (id: number) => {
    if (submitted) {
      if (!isSubmittedEditing || submittedSnapshot.current[id]) return;
      const next = { ...cards };
      delete next[id];
      setCards(next);
      setConfirmation(null);
      return;
    }
    const next = { ...cards };
    delete next[id];
    setCards(next);
    setConfirmation(null);
    saveDraft.mutate({ cards: payloadFor(next) });
  };
  const requestRemove = (id: number, name: string) => {
    if (!cards[id]) return;
    if (submitted) { removeNow(id); return; }
    if (unicodeLength(cards[id].reason.trim()) === 0) removeNow(id);
    else setConfirmation({ type: "remove", id, name });
  };
  const clearNow = () => {
    if (submitted) return;
    setCards({});
    setConfirmation(null);
    saveDraft.mutate({ cards: [] });
  };
  const validate = () => {
    if (payload.length === 0) return "请至少选择一位同事";
    if (payload.some((card) => { const length = unicodeLength(card.reason.trim()); return length < 1 || length > MAX_REASON_LENGTH; })) return "每张欣赏卡都需要填写1–1000个字符，空白卡不能正式提交";
    return "";
  };
  const handleSubmit = () => {
    const problem = validate();
    if (problem) { setError(problem); return; }
    setError("");
    setConfirmation({ type: "submit" });
  };
  const enterSubmittedEdit = () => {
    if (!mine.data || !canEditSubmitted || busy) return;
    const formal = cardMapFrom(mine.data.formalCards);
    const signature = draftSignature(formal);
    submittedSnapshot.current = formal;
    editRevision.current = mine.data.revision;
    savedSignature.current = signature;
    latestSignature.current = signature;
    failedSignature.current = "";
    setCards(formal);
    setEditingSubmitted(true);
    setRevisionConflict(false);
    setMessage("");
    setError("");
  };
  const cancelSubmittedNow = () => {
    const restored = submittedSnapshot.current;
    const signature = draftSignature(restored);
    setCards(restored);
    savedSignature.current = signature;
    latestSignature.current = signature;
    setEditingSubmitted(false);
    setRevisionConflict(false);
    setConfirmation(null);
    setMessage("");
    setError("");
  };
  const requestCancelSubmitted = () => {
    if (dirty) setConfirmation({ type: "cancel-submitted" });
    else cancelSubmittedNow();
  };
  const requestSaveSubmitted = () => {
    if (!canEditSubmitted || busy) return;
    const problem = validate();
    if (problem) { setError(problem); return; }
    setError("");
    setConfirmation({ type: "save-submitted" });
  };
  const reloadSubmittedNow = async () => {
    setReloading(true);
    setError("");
    try {
      await utils.nominate.mine.invalidate();
      const fresh = await utils.nominate.mine.fetch();
      if (!fresh) throw new Error("未能读取最新正式稿，请稍后重试");
      initializeFromMine(fresh);
      setConfirmation(null);
      setMessage("已重新读取最新正式稿");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setReloading(false);
    }
  };
  const confirmAction = () => {
    if (!confirmation || busy) return;
    if (confirmation.type === "remove") removeNow(confirmation.id);
    else if (confirmation.type === "clear") clearNow();
    else if (confirmation.type === "submit") submit.mutate({ cards: payload.map((card) => ({ ...card, reason: card.reason.trim() })) });
    else if (confirmation.type === "cancel-submitted") cancelSubmittedNow();
    else if (confirmation.type === "reload-submitted") void reloadSubmittedNow();
    else if (!saveInFlight.current) {
      saveInFlight.current = true;
      updateSubmitted.mutate({
        cards: payload.map((card) => ({ ...card, reason: card.reason.trim() })),
        expectedRevision: editRevision.current,
      });
    }
  };

  const saveFailed = dirty && failedSignature.current === currentSignature;
  const ownStatusTitle = mine.isLoading
    ? "正在读取本人云端内容"
    : submitted
      ? isSubmittedEditing ? "正在修改我的欣赏" : canEditSubmitted ? "欣赏已提交" : "欣赏已最终锁定"
      : saveDraft.isPending
        ? "正在保存本人草稿"
        : saveFailed
          ? "本人草稿保存失败"
          : dirty
            ? "本人草稿待自动保存"
            : mine.data?.status === "draft" ? "本人草稿已保存" : "期待你的欣赏";
  const ownStatusDescription = mine.isLoading
    ? "只读取本人内容"
    : submitted
      ? isSubmittedEditing
        ? "正式稿仍保留 · 保存后才会更新"
        : canEditSubmitted
          ? "收集开放期间可修改 · 进入下一环节后最终锁定"
          : mine.data?.submittedEditBlockedReason === "downstream-started" ? "后续活动已开始 · 当前正式稿仅供查看" : "收集已结束 · 当前正式稿仅供查看"
      : !canSubmitDraft
        ? "当前收集已关闭"
        : saveDraft.isPending
          ? "正在写入云端"
          : saveFailed
            ? "请重试或手动保存"
            : dirty ? "停止输入后自动保存" : "仅自己可见 · 云端保存";

  const submittedActions = () => {
    if (isSubmittedEditing) return <>
      <button className="outline-button" disabled={busy} onClick={requestCancelSubmitted}><X size={16} />取消修改</button>
      <button className="gold-button" disabled={busy || !canEditSubmitted} onClick={requestSaveSubmitted}><Save size={16} />{updateSubmitted.isPending ? "保存中…" : "保存修改"}</button>
    </>;
    if (canEditSubmitted) return <button className="gold-button" disabled={busy} onClick={enterSubmittedEdit}><Pencil size={16} />修改我的欣赏</button>;
    return <span className="locked-action"><LockKeyhole size={15} />正式稿已最终锁定</span>;
  };

  if (isLoading) return <LoadingPage />;
  if (!viewer || viewer.role !== "member") return <PageShell viewer={viewer} onLogout={logout}><div className="gate-panel"><Sparkles /><h1>请以成员身份登录</h1><p>推荐页只读取和保存你自己的内容。</p><Link className="gold-button" to="/">返回登录</Link></div></PageShell>;
  return (
    <PageShell viewer={viewer} onLogout={logout} className="nominate-shell">
      <div className="page-heading split-heading">
        <div><Link to="/" className="back-link"><ChevronLeft size={16} />返回首页</Link><h1>写下欣赏</h1><p>{viewer.districtName} · 一句话或一段故事都可以。</p></div>
        <div className="heading-side">
          <div className={`own-status ${submitted ? "submitted" : ""} ${isSubmittedEditing ? "editing" : ""} ${submitted && !canEditSubmitted && !isSubmittedEditing ? "locked" : ""}`}>
            <span>{submitted && !canEditSubmitted && !isSubmittedEditing ? <LockKeyhole size={18} /> : isSubmittedEditing ? <Pencil size={18} /> : submitted ? <CheckCheck size={18} /> : <PenLine size={18} />}</span>
            <div><strong>{ownStatusTitle}</strong><small>{ownStatusDescription}</small>{isSubmittedEditing && dirty && <b className="dirty-label">有未保存的修改</b>}</div>
          </div>
          {submitted && <div className="top-actions">{submittedActions()}</div>}
        </div>
      </div>
      {isSubmittedEditing && <div className="edit-notice"><Info size={17} /><span>当前正式稿会继续保留，保存修改后才更新</span></div>}
      <section className="nominate-workspace" aria-label="写下欣赏工作区">
        <aside className="member-picker">
          <div className="section-title"><div><Users size={19} /><h2>选择同事</h2></div><span>已选 {selected.length} 人</span></div>
          <p className="section-help">按完整姓名拼音排序，不限人数，可以选择自己；逐卡设置匿名。</p>
          {submitted ? <p className="picker-note">{isSubmittedEditing ? "已提交接收人不可移除；可添加新同事，本次新增卡保存前可移除。" : canEditSubmitted ? "当前为只读预览；点击“修改我的欣赏”后可调整正文与匿名设置。" : "收集已结束或后续活动已开始，接收人与内容均已最终锁定。"}</p> : <div className="picker-actions"><button disabled={!canSubmitDraft || busy || selected.length === 0} onClick={() => selected.some((member) => cards[member.id].reason.trim()) ? setConfirmation({ type: "clear" }) : clearNow()}>清空选择</button></div>}
          <div className="member-grid">
            {members.map((member) => {
              const active = Boolean(cards[member.id]);
              const committed = submitted && Boolean(submittedSnapshot.current[member.id]);
              const isNew = Boolean(isSubmittedEditing && active && !committed);
              const disabled = busy || (submitted ? !isSubmittedEditing || committed : !canSubmitDraft);
              const status = committed ? "已提交" : isNew ? "本次新增" : member.id === viewer.id ? "本人 · 可自荐" : active ? "已选择" : "可添加";
              return <button key={member.id} className={`member-choice ${active ? "selected" : ""} ${isNew ? "is-new" : ""}`} disabled={disabled} aria-pressed={active} aria-label={`${member.name}，${status}`} onClick={() => {
                if (active) requestRemove(member.id, member.name);
                else setCards((current) => ({ ...current, [member.id]: { reason: "", anonymous: false } }));
              }}><Avatar name={member.name} size={34} /><span className="member-meta"><strong>{member.name}</strong><small>{status}</small></span>{active ? isNew ? <X size={14} /> : <Check size={14} /> : <Plus size={14} />}</button>;
            })}
          </div>
        </aside>
        <div className="writing-panel">
          <div className="section-title"><div><PenLine size={19} /><h2>你的欣赏卡</h2></div><span>trim 后 1–1000 字符</span></div>
          {selected.length === 0 ? <div className="writing-empty"><span>✧</span><h3>期待你的欣赏</h3><p>选择同事后，在这里写下你真诚的欣赏。</p></div> : <div className="writing-list">
            {selected.map((member, index) => {
              const card = cards[member.id];
              const length = unicodeLength(card.reason);
              const committed = submitted && Boolean(submittedSnapshot.current[member.id]);
              const isNew = Boolean(isSubmittedEditing && !committed);
              return <article className={`writing-card ${isNew ? "new-card" : ""}`} key={member.id}>
                <header>
                  <div className="writing-recipient"><span className="card-number">{String(index + 1).padStart(2, "0")}</span><Avatar name={member.name} size={42} /><div><strong>致 {member.name}{isNew && <span className="new-badge">本次新增</span>}</strong><small>{isNew ? "保存前可移除" : isSubmittedEditing && committed ? "已提交接收人 · 不可移除" : member.id === viewer.id ? "这是一张写给自己的欣赏卡" : "让具体的闪光点被记住"}</small></div></div>
                  <div className="writing-card-actions">
                    <button className={`anonymous-toggle ${card.anonymous ? "active" : ""}`} aria-pressed={card.anonymous} aria-label={`${member.name}的匿名设置，当前${card.anonymous ? "匿名" : "署名"}`} disabled={!canEditCards || busy} onClick={() => updateCard(member.id, { anonymous: !card.anonymous })}>{card.anonymous ? <EyeOff size={15} /> : <Eye size={15} />}{card.anonymous ? "匿名" : "署名"}</button>
                    {canEditCards && (!submitted || isNew) && <button className="card-remove" aria-label={`移除对${member.name}的${isNew ? "新增" : "填写"}`} title={isNew ? "移除尚未保存的新增卡" : `移除对${member.name}的填写`} disabled={busy} onClick={() => requestRemove(member.id, member.name)}><X size={18} /></button>}
                  </div>
                </header>
                {canEditCards ? <AutoGrowingTextarea value={card.reason} onChange={(reason) => updateCard(member.id, { reason })} placeholder={`想对 ${member.name} 说…`} label={`写给${member.name}的欣赏`} /> : <LongReason value={card.reason} />}
                <footer><span>{card.anonymous ? "揭晓时将显示“匿名同事”" : "揭晓时将显示你的姓名"}</span><span className="reason-count">{isSubmittedEditing ? `${length} / 1000` : submitted ? "本人正式稿" : length >= 900 ? `${length} / 1000` : ""}</span></footer>
              </article>;
            })}
          </div>}
          <div className="submit-bar">
            <div>
              {message && <p className="form-success"><CheckCheck size={16} />{message}</p>}
              {error && <p className="form-error" role="alert">{error}</p>}
              {revisionConflict && <button className="outline-button reload-button" disabled={busy} onClick={() => setConfirmation({ type: "reload-submitted" })}>重新读取正式稿</button>}
              {mine.data && submitted && !isSubmittedEditing && <p className="locked-note">{canEditSubmitted ? "当前为本人正式提交内容，仅供查看。" : "欣赏收集已结束或后续活动已开始，当前内容仅供查看。"}</p>}
              {mine.data && isSubmittedEditing && <p className="locked-note">{!canEditSubmitted ? "当前环节已最终锁定，未保存输入不能提交。" : dirty ? "有未保存的修改；离开编辑前请保存，或取消并恢复正式稿。" : "尚未更改内容。当前编辑不会自动保存到正式稿。"}</p>}
              {mine.data && !submitted && !canSubmitDraft && <p className="locked-note">欣赏收集已关闭，当前内容仅供查看。</p>}
            </div>
            <div className="submit-actions">{submitted ? submittedActions() : <>
              <button className="outline-button" disabled={!canSubmitDraft || busy} onClick={() => saveDraft.mutate({ cards: payload })}><Save size={17} />{saveDraft.isPending ? "保存中…" : "保存草稿"}</button>
              <button className="gold-button" disabled={!canSubmitDraft || busy || selected.length === 0} onClick={handleSubmit}><Send size={17} />{submit.isPending ? "提交中…" : "正式提交"}</button>
            </>}</div>
          </div>
        </div>
      </section>
      <ConfirmDialog confirmation={confirmation} busy={busy} onCancel={() => setConfirmation(null)} onConfirm={confirmAction} />
    </PageShell>
  );
}
