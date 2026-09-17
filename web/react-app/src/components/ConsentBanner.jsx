import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

const CONSENT_KEY = 'hugpong_cookie_consent';

export default function ConsentBanner() {
  const [visible, setVisible] = useState(() => {
    try { return !localStorage.getItem(CONSENT_KEY); } catch (error) { return true; }
  });
  const button = useRef(null);
  useEffect(() => { if (visible) button.current?.focus(); }, [visible]);
  if (!visible) return null;
  function accept() {
    try { localStorage.setItem(CONSENT_KEY, JSON.stringify({ accepted: true, timestamp: new Date().toISOString(), version: '2.4' })); } catch (error) { /* notice remains functional without persistence */ }
    setVisible(false);
  }
  return <aside role="region" aria-label="Data Privacy and Storage Consent Notice" className="fixed bottom-4 left-4 right-4 z-50 ml-auto max-w-xl rounded-2xl border border-hug-border bg-white/95 p-5 shadow-2xl backdrop-blur-md sm:bottom-6 sm:right-6">
    <h2 className="text-sm font-extrabold text-slate-900">Data Privacy &amp; Essential Storage Notice <span className="ml-2 rounded bg-green-100 px-2 py-1 text-[10px] text-hug-primary">RA 10173</span></h2>
    <p className="mt-2 text-xs leading-5 text-hug-muted">HUGPONG uses strictly necessary local storage for authenticated sessions, read replicas, and offline mobile field mutations. It does not use advertising or commercial tracking cookies.</p>
    <div className="mt-3 flex items-center gap-3 text-xs font-bold text-hug-primary"><Link to="/privacy">Privacy Policy</Link><span>·</span><Link to="/cookies">Storage Details</Link></div>
    <div className="mt-4 border-t border-slate-100 pt-3 text-right"><button ref={button} onClick={accept} className="rounded-xl bg-hug-primary px-5 py-2.5 text-xs font-bold text-white">Acknowledge &amp; Accept</button></div>
  </aside>;
}
