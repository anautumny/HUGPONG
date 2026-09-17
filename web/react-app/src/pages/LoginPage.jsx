import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { emptyLoginAttemptState, loginLockRemaining, recordLoginFailure } from '../domain/authAttemptPolicy';
import { workspacePath } from '../services/roleRouting';

export default function LoginPage() {
  const { status, session, signIn, requestFirstLoginOtp, verifyFirstLoginOtp, completeFirstLoginPassword } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(null);
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [notice, setNotice] = useState('');
  const [attemptState, setAttemptState] = useState(emptyLoginAttemptState);
  const [clock, setClock] = useState(Date.now());
  const lockRemaining = loginLockRemaining(attemptState, clock);

  useEffect(() => {
    if (!lockRemaining) return undefined;
    const timer = window.setTimeout(() => setClock(Date.now()), Math.min(1000, lockRemaining));
    return () => window.clearTimeout(timer);
  }, [lockRemaining]);

  if (status === 'authenticated') return <Navigate replace to={workspacePath(session.roleKey)} />;

  async function submit(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    const remaining = loginLockRemaining(attemptState);
    if (remaining) return setError(`Too many failed attempts. Try again in ${Math.ceil(remaining / 1000)} seconds.`);
    if (!identifier.trim() || !password) return setError('Enter your User ID or mobile number and password.');
    if (!consent) return setError('Acknowledge the Privacy Policy (RA 10173) and Terms to proceed.');
    setSubmitting(true);
    try {
      const result = await signIn(identifier.trim(), password);
      setAttemptState(emptyLoginAttemptState);
      if (result.completionRequired) {
        setPending(result);
        if (result.nextStep === 'phone') {
          const challenge = await requestFirstLoginOtp(result);
          setNotice(`Verification code sent. It expires at ${new Date(challenge.expiresAt).toLocaleTimeString()}.`);
        }
      }
    } catch (cause) {
      setAttemptState(current => recordLoginFailure(current));
      setClock(Date.now());
      setError(cause.message || 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyOtp(event) {
    event.preventDefault(); setError(''); setSubmitting(true);
    try {
      const result = await verifyFirstLoginOtp(pending, otpCode);
      setPending(result.completionRequired ? result : null);
      setNotice(result.completionRequired ? 'Phone verified. Set a permanent password to continue.' : 'Phone verified.');
    } catch (cause) { setError(cause.message); } finally { setSubmitting(false); }
  }

  async function resendOtp() {
    setError(''); setSubmitting(true);
    try {
      const challenge = await requestFirstLoginOtp(pending);
      setNotice(`New verification code sent. It expires at ${new Date(challenge.expiresAt).toLocaleTimeString()}.`);
    } catch (cause) { setError(cause.message); } finally { setSubmitting(false); }
  }

  async function changePassword(event) {
    event.preventDefault(); setError('');
    if (newPassword.length < 8) return setError('Password must contain at least 8 characters.');
    if (newPassword !== confirmPassword) return setError('Password confirmation does not match.');
    setSubmitting(true);
    try {
      const result = await completeFirstLoginPassword(pending, newPassword);
      setPending(result.completionRequired ? result : null);
    } catch (cause) { setError(cause.message); } finally { setSubmitting(false); }
  }

  return (
    <main className="grid min-h-screen bg-hug-background lg:grid-cols-[1.05fr_0.95fr]">
      <section className="hidden bg-hug-primary p-14 text-white lg:flex lg:flex-col lg:justify-between">
        <div>
          <p className="text-3xl font-black tracking-tight">HUGPONG</p>
          <p className="mt-2 text-sm font-semibold uppercase tracking-[0.18em] text-green-100">Farm Management System</p>
        </div>
        <div className="max-w-xl">
          <h1 className="text-5xl font-black leading-tight">Connected farm operations, grounded in one trusted record.</h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-green-50">Sign in to your existing role workspace. This migration keeps the established server-authoritative authentication and realtime data services.</p>
        </div>
        <p className="text-xs text-green-100">Sugar Regulatory Administration · HUGPONG</p>
      </section>
      <section className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md rounded-3xl border border-hug-border bg-white p-7 shadow-xl shadow-green-950/5 sm:p-9">
          <div className="lg:hidden">
            <p className="text-2xl font-black text-hug-primary">HUGPONG</p>
          </div>
          <p className="mt-6 text-xs font-bold uppercase tracking-[0.16em] text-hug-primary-light">Secure access</p>
          <h2 className="mt-2 text-3xl font-black text-slate-900">Welcome back</h2>
          <p className="mt-2 text-sm leading-6 text-hug-muted">Use the same HUGPONG credentials as the current web application.</p>

          {!pending && <form className="mt-7 space-y-5" onSubmit={submit}>
            <label className="block text-sm font-bold text-slate-700">
              User ID or mobile number
              <input autoComplete="username" value={identifier} onChange={event => setIdentifier(event.target.value)} className="mt-2 w-full rounded-xl border border-hug-border px-4 py-3 outline-none focus:border-hug-primary focus:ring-2 focus:ring-green-100" />
            </label>
            <label className="block text-sm font-bold text-slate-700">
              Password
              <input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-hug-border px-4 py-3 outline-none focus:border-hug-primary focus:ring-2 focus:ring-green-100" />
            </label>
            <label className="flex items-start gap-3 text-xs leading-5 text-hug-muted">
              <input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} className="mt-1 h-4 w-4 accent-hug-primary" />
              <span>I acknowledge the <Link className="font-bold text-hug-primary underline" to="/privacy">Privacy Policy (RA 10173)</Link> and <Link className="font-bold text-hug-primary underline" to="/terms">Terms</Link> for authorized system use.</span>
            </label>
            {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
            <button disabled={submitting || lockRemaining > 0} className="w-full rounded-xl bg-hug-primary px-4 py-3 font-extrabold text-white hover:bg-hug-primary-light disabled:cursor-not-allowed disabled:opacity-60">
              {submitting ? 'Authenticating…' : lockRemaining > 0 ? `Try again in ${Math.ceil(lockRemaining / 1000)}s` : 'Sign in'}
            </button>
          </form>}
          {pending?.nextStep === 'phone' && <form className="mt-7 space-y-5" onSubmit={verifyOtp}>
            <div className="rounded-xl border border-hug-border bg-green-50 px-4 py-3 text-sm text-hug-primary">{notice || 'Requesting your verification code…'}</div>
            <label className="block text-sm font-bold text-slate-700">Six-digit verification code
              <input inputMode="numeric" maxLength={6} value={otpCode} onChange={event => setOtpCode(event.target.value.replace(/\D/g, ''))} className="mt-2 w-full rounded-xl border border-hug-border px-4 py-3 tracking-[0.35em] outline-none focus:border-hug-primary" />
            </label>
            {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
            <button disabled={submitting || otpCode.length !== 6} className="w-full rounded-xl bg-hug-primary px-4 py-3 font-extrabold text-white disabled:opacity-60">Verify phone</button>
            <button disabled={submitting} type="button" onClick={resendOtp} className="w-full rounded-xl border border-hug-border px-4 py-3 text-sm font-bold text-hug-primary disabled:opacity-60">Resend code</button>
          </form>}
          {pending?.nextStep === 'password' && <form className="mt-7 space-y-5" onSubmit={changePassword}>
            {notice && <div className="rounded-xl border border-hug-border bg-green-50 px-4 py-3 text-sm text-hug-primary">{notice}</div>}
            <label className="block text-sm font-bold text-slate-700">New password
              <input type="password" autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-hug-border px-4 py-3 outline-none focus:border-hug-primary" />
            </label>
            <label className="block text-sm font-bold text-slate-700">Confirm new password
              <input type="password" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-hug-border px-4 py-3 outline-none focus:border-hug-primary" />
            </label>
            {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
            <button disabled={submitting} className="w-full rounded-xl bg-hug-primary px-4 py-3 font-extrabold text-white disabled:opacity-60">Save password and continue</button>
          </form>}
        </div>
      </section>
    </main>
  );
}
