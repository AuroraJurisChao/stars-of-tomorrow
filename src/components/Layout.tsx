import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router";
import { Check, ChevronDown, KeyRound, LogOut, MonitorUp, Sparkles, X } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { validateNewPassword } from "@contracts/constants";
import { errorMessage } from "@/lib/interaction";
import { StarCanvas } from "./StarCanvas";
import { Avatar } from "./Avatar";
import { screenPath } from "@contracts/screen";

export type Viewer = { id: number; name: string; role: "member" | "organizer"; districtId?: string; districtName?: string } | null | undefined;

export function Brand({ dark = false }: { dark?: boolean }) {
  return (
    <Link to="/" className={`brand ${dark ? "brand-dark" : ""}`} aria-label="明日之星首页">
      <span className="brand-mark"><Sparkles size={18} strokeWidth={1.4} /></span>
      <span><strong>明日之星</strong></span>
    </Link>
  );
}

function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const currentInput = useRef<HTMLInputElement>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const change = trpc.auth.changePassword.useMutation({
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setError("");
      setSuccess(true);
    },
    onError: (cause) => setError(errorMessage(cause)),
  });

  useEffect(() => {
    if (!open) return;
    setError("");
    setSuccess(false);
    change.reset();
    const previous = document.activeElement as HTMLElement | null;
    const timer = window.setTimeout(() => currentInput.current?.focus(), 0);
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !change.isPending) onClose();
      if (event.key !== "Tab" || !panel.current) return;
      const focusable = [...panel.current.querySelectorAll<HTMLElement>("input, button:not(:disabled)")];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", keydown);
      previous?.focus();
    };
  }, [open]);

  if (!open) return null;
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    const strength = validateNewPassword(newPassword);
    if (strength) { setError(strength); return; }
    if (newPassword === currentPassword) { setError("新密码不能与当前密码相同"); return; }
    if (newPassword !== confirmPassword) { setError("两次输入的新密码不一致"); return; }
    change.mutate({ currentPassword, newPassword, confirmPassword });
  };

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !change.isPending) onClose(); }}>
      <div className="password-dialog" role="dialog" aria-modal="true" aria-labelledby="password-dialog-title" ref={panel}>
        <button className="dialog-close" onClick={onClose} disabled={change.isPending} aria-label="关闭修改密码"><X size={19} /></button>
        {success ? <div className="password-success">
          <span><Check size={24} /></span>
          <h2 id="password-dialog-title">密码已修改</h2>
          <p>当前会话已保留，其他会话已退出。下次请使用新密码登录。</p>
          <button className="gold-button full-button" onClick={onClose}>完成</button>
        </div> : <form onSubmit={submit}>
          <h2 id="password-dialog-title">修改密码</h2>
          <p className="dialog-intro">新密码为 8–20 个字符，至少包含一个英文字母和一个数字。</p>
          <label className="dialog-label" htmlFor="current-password">当前密码</label>
          <input ref={currentInput} id="current-password" type="password" maxLength={20} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required />
          <label className="dialog-label" htmlFor="new-password">新密码</label>
          <input id="new-password" type="password" minLength={8} maxLength={20} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" required />
          <label className="dialog-label" htmlFor="confirm-password">再次确认新密码</label>
          <input id="confirm-password" type="password" minLength={8} maxLength={20} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required />
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="dialog-actions"><button type="button" className="outline-button" onClick={onClose} disabled={change.isPending}>取消</button><button className="gold-button" disabled={change.isPending || !currentPassword || !newPassword || !confirmPassword}>{change.isPending ? "正在修改…" : "确认修改"}</button></div>
        </form>}
      </div>
    </div>
  );
}

export function AppHeader({ viewer, onLogout, onLogin, dark = false, minimal = false, referenceHome = false }: { viewer?: Viewer; onLogout?: () => void; onLogin?: () => void; dark?: boolean; minimal?: boolean; referenceHome?: boolean }) {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const account = useRef<HTMLDivElement>(null);
  const accountButton = useRef<HTMLButtonElement>(null);
  const firstMenuItem = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const pointer = (event: PointerEvent) => {
      if (!account.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", pointer);
    return () => document.removeEventListener("pointerdown", pointer);
  }, [menuOpen]);

  const closePassword = () => {
    setPasswordOpen(false);
    window.setTimeout(() => accountButton.current?.focus(), 0);
  };

  return (
    <header className={`app-header ${dark ? "header-dark" : ""} ${minimal ? "header-minimal" : ""} ${referenceHome ? "site-header reference-home-header" : ""}`}>
      {referenceHome ? <Link to="/" className="brand reference-brand" aria-label="明日之星首页">
        <svg className="brand__mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <path d="M16 1.5 19.3 12.7 30.5 16 19.3 19.3 16 30.5 12.7 19.3 1.5 16 12.7 12.7 16 1.5Z" stroke="currentColor" strokeWidth="1.1" />
          <path d="m16 8 2.1 5.9L24 16l-5.9 2.1L16 24l-2.1-5.9L8 16l5.9-2.1L16 8Z" fill="currentColor" />
        </svg>
        <span className="brand__name">明日之星</span>
        <span className="brand__english" aria-hidden="true">STARS OF<br />TOMORROW</span>
      </Link> : <Brand dark={dark} />}
      {referenceHome ? <nav className="site-nav" aria-label="页面导航">
        <span className="site-nav__note">年度同行 · 星光为证</span>
        <a className="site-nav__link" href="#about">关于活动</a>
      </nav> : !minimal && <nav className="main-nav" aria-label="主要入口">
        {viewer?.role === "member" && <>
          <NavLink to="/nominate" className={location.pathname === "/nominate" ? "active" : ""}>写欣赏</NavLink>
          <NavLink to="/play" className={location.pathname === "/play" ? "active" : ""}>参与现场</NavLink>
        </>}
        {viewer?.role === "organizer" && <NavLink to="/control" className={location.pathname === "/control" ? "active" : ""}>组织者中控</NavLink>}
        <NavLink to={screenPath(viewer?.districtId)} className={location.pathname === "/screen" ? "active" : ""}><MonitorUp size={15} />独立大屏</NavLink>
      </nav>}
      <div className="header-account">
        {viewer ? <div className="account-menu-wrap" ref={account}>
          <button
            ref={accountButton}
            className="account-trigger"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)}
            onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); setMenuOpen(true); window.setTimeout(() => firstMenuItem.current?.focus(), 0); } }}
          >
            <Avatar name={viewer.name} size={32} /><span className="account-name">{viewer.name}</span><ChevronDown size={15} />
          </button>
          {menuOpen && <div className="account-menu" role="menu" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setMenuOpen(false); accountButton.current?.focus(); } }}>
            {viewer.districtName && <p className="account-district">{viewer.districtName}</p>}
            <button ref={firstMenuItem} role="menuitem" onClick={() => { setMenuOpen(false); setPasswordOpen(true); }}><KeyRound size={16} />修改密码</button>
            <button role="menuitem" onClick={() => { setMenuOpen(false); onLogout?.(); }}><LogOut size={16} />退出登录</button>
          </div>}
        </div> : minimal ? <button type="button" className="header-login" onClick={onLogin}>成员登录</button> : <Link className="text-link" to="/">成员登录</Link>}
      </div>
      <ChangePasswordDialog open={passwordOpen} onClose={closePassword} />
    </header>
  );
}

export function PageShell({ children, viewer, onLogout, dark = false, className = "" }: { children: ReactNode; viewer?: Viewer; onLogout?: () => void; dark?: boolean; className?: string }) {
  return (
    <div className={`page-shell ${dark ? "night-shell" : "paper-shell"} ${className}`}>
      <StarCanvas constellation={dark} />
      <AppHeader viewer={viewer} onLogout={onLogout} dark={dark} />
      <main className="page-main">{children}</main>
      <footer className="page-footer"><span>让每一份真诚的欣赏，都被看见。</span><span>明日之星 · 2026</span></footer>
    </div>
  );
}

export function LoadingPage({ dark = false }: { dark?: boolean }) {
  return <div className={`loading-page ${dark ? "night-shell" : "paper-shell"}`}><StarCanvas /><div className="loading-star">✦</div><p>星光正在汇聚</p></div>;
}
