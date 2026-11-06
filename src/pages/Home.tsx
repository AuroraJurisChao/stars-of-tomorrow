import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { KeyRound, MonitorUp } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { AppHeader } from "@/components/Layout";
import { HomeStage } from "@/components/HomeStage";
import { useViewer } from "@/lib/viewer";
import { errorMessage } from "@/lib/interaction";
import { screenPath } from "@contracts/screen";
import "../home-v6.css";

export default function Home() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const entryDialog = useRef<HTMLDialogElement>(null);
  const { viewer, logout } = useViewer();
  const [districtId, setDistrictId] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const bootstrap = trpc.auth.bootstrap.useQuery({ districtId: districtId || undefined });
  const mine = trpc.nominate.mine.useQuery(undefined, { enabled: viewer?.role === "member", retry: false });
  const login = trpc.auth.login.useMutation({
    onSuccess: async (member) => {
      setError("");
      setPassword("");
      entryDialog.current?.close();
      utils.auth.me.setData(undefined, member);
      await utils.auth.me.invalidate();
      navigate(member.role === "organizer" ? "/control" : "/nominate");
    },
    onError: (cause) => setError(errorMessage(cause)),
  });

  const districtReady = Boolean(districtId && bootstrap.data?.district?.id === districtId);
  const districtMembers = districtReady ? bootstrap.data?.members ?? [] : [];
  const organizerName = districtReady ? bootstrap.data?.organizerName : null;
  const hasNames = districtMembers.length > 0 || Boolean(organizerName);
  const showEmptyDistrict = districtReady && !bootstrap.isFetching && !hasNames;
  const primaryLabel = viewer?.role === "organizer"
    ? "进入组织者中控"
    : viewer?.role === "member" && mine.data?.status === "draft"
      ? "继续写欣赏"
      : viewer?.role === "member" && mine.data?.status === "submitted"
        ? mine.data.canEditSubmitted ? "查看／修改我的欣赏" : "查看我的欣赏"
        : "写下我的欣赏";

  const openEntry = () => {
    if (viewer) {
      navigate(viewer.role === "organizer" ? "/control" : "/nominate");
      return;
    }
    setError("");
    entryDialog.current?.showModal();
    window.setTimeout(() => document.getElementById("district")?.focus(), 0);
  };
  const closeEntry = () => {
    if (!login.isPending) entryDialog.current?.close();
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!districtId || !name || !password) {
      setError("请先选择选区和姓名，再输入密码");
      return;
    }
    login.mutate({ districtId, name, password });
  };

  return (
    <div className="v6-home">
      <a className="skip-link" href="#main-content">跳至主要内容</a>
      <div className="page-shell">
        <AppHeader viewer={viewer} onLogout={logout} onLogin={openEntry} dark minimal referenceHome />
        <main id="main-content">
          <section className="hero" aria-labelledby="hero-title">
            <div className="hero__inner">
              <div className="hero__copy">
                <p className="eyebrow">
                  年度同行 · 星光为证
                  <svg className="eyebrow__star" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                    <path d="m6 0 1.25 4.75L12 6 7.25 7.25 6 12 4.75 7.25 0 6l4.75-1.25L6 0Z" />
                  </svg>
                </p>
                <h1 className="hero-title" id="hero-title">
                  <span className="hero-title__line">期待你的</span>
                  <span className="hero-title__accent">欣赏</span>
                </h1>
                <p className="hero__description">那些认真协作、彼此照亮的日子，<br />值得被郑重记下。</p>
                <div className="hero__actions">
                  <button className="button-primary" type="button" aria-haspopup={viewer ? undefined : "dialog"} aria-controls="entry-dialog" onClick={openEntry}>
                    <span>{primaryLabel}</span>
                    <svg className="button-primary__arrow" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                      <path d="M3 10h13M11.5 5.5 16 10l-4.5 4.5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <a className="button-secondary" href="#about">
                    <span className="button-secondary__dot" aria-hidden="true"></span>
                    了解明日之星
                  </a>
                </div>
              </div>
              <HomeStage />
              <div className="hero__veil" aria-hidden="true"></div>
              <p className="hero__footnote">愿每一份真诚，都有温暖回声</p>
            </div>
          </section>

          <section className="about" id="about" aria-labelledby="about-title">
            <div className="about__inner">
              <div className="about__heading">
                <div>
                  <p className="section-kicker">微光成河 · 与君共勉</p>
                  <h2 className="about__title" id="about-title">把看见，留给彼此。</h2>
                </div>
                <p className="about__intro">明日之星，是一份关于欣赏的年度约定。不为比较，也不为喧哗，只想将那些协作中的善意、坚持与信任，认真收藏。</p>
              </div>
              <ol className="values">
                <li className="value">
                  <span className="value__number" aria-hidden="true">01</span>
                  <h3 className="value__title">看见</h3>
                  <p className="value__text">看见那些不动声色，<br />却始终认真的努力。</p>
                </li>
                <li className="value">
                  <span className="value__number" aria-hidden="true">02</span>
                  <h3 className="value__title">记录</h3>
                  <p className="value__text">把一句真诚的感谢，<br />郑重地写下来。</p>
                </li>
                <li className="value">
                  <span className="value__number" aria-hidden="true">03</span>
                  <h3 className="value__title">珍藏</h3>
                  <p className="value__text">让共同走过的微光，<br />成为往后的温暖回响。</p>
                </li>
              </ol>
            </div>
          </section>
        </main>

        <footer className="site-footer">
          <div className="site-footer__inner">
            <div className="site-footer__brand">
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="m10 0 2.35 7.65L20 10l-7.65 2.35L10 20l-2.35-7.65L0 10l7.65-2.35L10 0Z" fill="currentColor" />
              </svg>
              <span>明日之星</span>
            </div>
            <p className="site-footer__wish">愿每一份真诚，都被温柔看见。</p>
          </div>
        </footer>
      </div>

      <dialog
        ref={entryDialog}
        className="entry-dialog"
        id="entry-dialog"
        aria-labelledby="entry-title"
        aria-describedby="entry-description"
        onCancel={(event) => { if (login.isPending) event.preventDefault(); }}
        onClick={(event) => { if (event.target === event.currentTarget) closeEntry(); }}
      >
        <div className="entry-dialog__body">
          <button className="entry-dialog__close" type="button" aria-label="关闭欣赏入口" onClick={closeEntry} disabled={login.isPending}>
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="m4 4 12 12M16 4 4 16" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </button>
          <div className="entry-dialog__emblem" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none">
              <path d="M16 2 19.1 12.9 30 16l-10.9 3.1L16 30l-3.1-10.9L2 16l10.9-3.1L16 2Z" stroke="currentColor" strokeWidth="1" />
              <path d="m16 9 1.8 5.2L23 16l-5.2 1.8L16 23l-1.8-5.2L9 16l5.2-1.8L16 9Z" fill="currentColor" />
            </svg>
          </div>
          <p className="entry-dialog__kicker">明日之星 · 欣赏入口</p>
          <form className="login-panel" onSubmit={submit}>
            <h2 className="entry-dialog__title" id="entry-title">让欣赏，有处可栖。</h2>
            <p className="entry-dialog__description" id="entry-description">选择所在选区与姓名，登录后即可书写。<br />草稿会保存到云端，可稍后继续。</p>
            <label className="field-label" htmlFor="district">选区</label>
            <div className="select-wrap">
              <select id="district" value={districtId} onChange={(event) => { setDistrictId(event.target.value); setName(""); setPassword(""); setError(""); }} required>
                <option value="">请先选择选区</option>
                {bootstrap.data?.districts.map((district) => <option key={district.id} value={district.id}>{district.name}</option>)}
              </select>
            </div>
            <label className="field-label" htmlFor="member-name">姓名</label>
            <div className="select-wrap">
              <select id="member-name" value={name} onChange={(event) => { setName(event.target.value); setError(""); }} autoComplete="username" disabled={!districtReady || !hasNames || bootstrap.isFetching} required>
                <option value="">请选择姓名</option>
                {districtMembers.map((member) => <option key={member.id} value={member.name}>{member.name}</option>)}
                {organizerName && <option value={organizerName}>{organizerName}</option>}
              </select>
            </div>
            {showEmptyDistrict && <p className="empty-district-note" role="status">该选区成员名单尚未配置，请联系组织者</p>}
            <label className="field-label" htmlFor="member-password">密码</label>
            <div className="password-wrap">
              <KeyRound size={17} />
              <input id="member-password" type="password" maxLength={20} value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} placeholder="请输入密码" autoComplete="current-password" disabled={!hasNames || bootstrap.isFetching} required />
            </div>
            {(error || bootstrap.isError) && <p className="form-error" role="alert">{error || errorMessage(bootstrap.error)}</p>}
            <button className="button-primary entry-submit" disabled={login.isPending || bootstrap.isLoading || bootstrap.isFetching || !name || !password}>
              <span>{login.isPending ? "正在登录…" : "登录并写下欣赏"}</span>
              <svg className="button-primary__arrow" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M3 10h13M11.5 5.5 16 10l-4.5 4.5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <p className="privacy-note">会话 8 小时内有效</p>
          </form>
          <div className="dialog-screen-row"><Link to={screenPath(districtId || viewer?.districtId)} className="home-screen-link"><MonitorUp size={16} />独立大屏</Link></div>
        </div>
      </dialog>
    </div>
  );
}
