import { Link } from 'react-router-dom';

export default function PublicLayout({ children }) {
  return <div className="min-h-screen bg-hug-background text-slate-800">
    <header className="border-b border-hug-border bg-white"><div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
      <Link to="/" className="text-xl font-black tracking-tight text-hug-primary">HUGPONG</Link>
      <nav className="flex items-center gap-4 text-sm font-bold"><Link to="/privacy" className="hidden hover:text-hug-primary sm:inline">Privacy</Link><Link to="/login" className="rounded-full bg-hug-primary px-5 py-2.5 text-white">Web Console</Link></nav>
    </div></header>
    {children}
    <footer className="border-t border-hug-border bg-white"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-3 px-6 py-5 text-xs font-semibold text-hug-muted md:flex-row">
      <p>© 2026 HUGPONG. Silay Sugarcane Block Farm &amp; Regional SRA Governance Platform.</p>
      <div className="flex flex-wrap gap-4"><Link to="/privacy">Privacy Policy (RA 10173)</Link><Link to="/terms">Terms of Use</Link><Link to="/cookies">Cookie Policy</Link><Link to="/login">Admin Gateway</Link></div>
    </div></footer>
  </div>;
}
