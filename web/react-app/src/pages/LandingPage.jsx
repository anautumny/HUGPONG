import { Link } from 'react-router-dom';
import PublicLayout from '../components/PublicLayout';
import { useAuth } from '../auth/AuthProvider';
import { workspacePath } from '../services/roleRouting';

const pillars = ['Explicit offline mutation outbox', 'Official SRA 6-stage timeline', 'Weekly SRA price indexing', 'Audited field labor accounting'];

export default function LandingPage() {
  const { session } = useAuth();
  return <PublicLayout><main className="mx-auto grid min-h-[calc(100vh-142px)] max-w-7xl items-center gap-10 px-6 py-14 lg:grid-cols-2 lg:py-20">
    <section><span className="inline-flex rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-extrabold uppercase tracking-wider text-hug-primary">Offline-first sugarcane platform</span>
      <h1 className="mt-6 text-4xl font-black uppercase tracking-tight text-slate-950 sm:text-6xl">Welcome to our<br/><span className="text-hug-primary">Sugarcane Hub</span></h1>
      <p className="mt-6 max-w-2xl text-lg leading-8 text-hug-muted">Bridging intermittent field connectivity with regional regulatory oversight. Track the 6-stage SRA agronomic cycle, access weekly sugar price bulletins, and manage block farm allocations with tamper-resistant audit integrity.</p>
      <div className="mt-7 grid gap-3 text-sm font-bold sm:grid-cols-2">{pillars.map(item => <p key={item} className="flex items-center gap-2"><span className="text-hug-primary">✓</span>{item}</p>)}</div>
      <div className="mt-9 flex flex-wrap gap-4"><Link to={session ? workspacePath(session.roleKey) : '/login'} className="rounded-full bg-slate-950 px-7 py-3.5 text-sm font-bold text-white hover:bg-hug-primary">{session ? 'Open Workspace' : 'Launch Web Console'}</Link><a href="https://github.com/Mattaeeee/HUGPONG/releases" target="_blank" rel="noreferrer" className="rounded-full border border-hug-border bg-white px-7 py-3.5 text-sm font-bold">Download Android APK</a></div>
    </section>
    <section className="relative grid min-h-96 place-items-center overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-[#0f5132] via-[#198754] to-[#20c997] p-10 text-white shadow-2xl shadow-green-950/20">
      <div className="absolute inset-0 grid grid-cols-5">{Array.from({ length: 5 }).map((_, index) => <span key={index} className="border-l border-white/15 bg-white/[0.03]" />)}</div>
      <div className="relative text-center"><p className="text-5xl font-black tracking-[0.16em] sm:text-7xl">HUGPONG</p><p className="mt-5 text-sm font-bold uppercase tracking-[0.2em] text-green-100">Silay · Block Farms · SRA Governance</p></div>
    </section>
  </main></PublicLayout>;
}
