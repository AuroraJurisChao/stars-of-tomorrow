import { Link } from "react-router";
import { ArrowLeft, Sparkles } from "lucide-react";
import { PageShell } from "@/components/Layout";
import { useViewer } from "@/lib/viewer";

export default function NotFound() {
  const { viewer, logout } = useViewer();
  return <PageShell viewer={viewer} onLogout={logout} dark><div className="gate-panel"><Sparkles /><p className="eyebrow">LOST IN THE STARS</p><h1>这颗星还未被点亮</h1><p>你访问的页面不存在，回到星图继续前行。</p><Link to="/" className="gold-button"><ArrowLeft size={17} />返回首页</Link></div></PageShell>;
}
