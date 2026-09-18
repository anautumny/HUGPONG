import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Check, ArrowRight, Download, Github } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ConsentBanner from '../components/common/ConsentBanner';

export default function LandingView() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen w-full flex flex-col justify-between relative overflow-x-hidden bg-bg text-hug-text selection:bg-primary selection:text-white">
      {/* Top Header */}
      <header className="w-full px-6 sm:px-10 lg:px-16 py-4 flex items-center justify-between border-b border-border relative z-30 bg-surface/90 backdrop-blur-md">
        {/* Brand Logo */}
        <Link to="/" className="flex items-center gap-3 group">
          <div className="brand-logo-box w-10 h-10 rounded-xl bg-white border border-border/80 p-1 flex items-center justify-center shadow-xs overflow-hidden group-hover:border-primary/40 transition-colors">
            <img src="/logo.png" alt="HUGPONG Official Emblem" className="w-full h-full object-contain" />
          </div>
          <div className="flex flex-col">
            <span className="font-display font-black text-xl tracking-tight text-hug-text leading-none">
              HUGPONG
            </span>
            <span className="text-[10px] font-bold text-hug-muted tracking-wider uppercase mt-0.5">
              Sugarcane Digital Governance
            </span>
          </div>
        </Link>

        {/* Navigation Links */}
        <nav className="flex items-center gap-4 sm:gap-6 text-xs sm:text-sm font-semibold text-hug-text2">
          <a
            href="https://github.com/Mattaeeee/HUGPONG/releases"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary transition-colors hidden sm:flex items-center gap-1.5"
          >
            <Github className="w-4 h-4 text-hug-muted shrink-0" />
            <span>GitHub Releases (APK)</span>
          </a>
          <Link
            to={isAuthenticated ? "/dashboard" : "/login"}
            className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white font-bold transition-all shadow-xs hover:shadow"
          >
            {isAuthenticated ? "Open Dashboard" : "Sign In"}
          </Link>
        </nav>
      </header>

      {/* Main Split Layout */}
      <main className="flex-1 w-full grid grid-cols-1 lg:grid-cols-12 items-center relative z-20 max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 py-10 lg:py-16 gap-12">
        {/* Left Column: Hero Content & CTAs */}
        <section className="lg:col-span-6 flex flex-col justify-center space-y-6">
          {/* Status Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface border border-border text-hug-text2 text-xs font-semibold shadow-2xs self-start">
            <span className="w-2 h-2 rounded-full bg-primary" />
            <span>Sugarcane Digital Governance &amp; SRA Authority</span>
          </div>

          {/* Main Headline */}
          <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-hug-text leading-tight">
            Silay Sugarcane Block Farm &amp;{' '}
            <span className="text-primary">SRA Governance Platform</span>
          </h1>

          {/* Subtext */}
          <p className="text-sm sm:text-base text-hug-text2 font-normal leading-relaxed">
            Bridging intermittent field connectivity with regional regulatory oversight. Track the 6-stage SRA agronomic cycle, access weekly sugar price bulletins, and manage block farm allocations with tamper-resistant audit integrity.
          </p>

          {/* Key Feature Pillars */}
          <div className="pt-1 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm font-semibold text-hug-text">
            <div className="flex items-center gap-2.5">
              <Check className="w-4 h-4 text-primary shrink-0" strokeWidth={2.5} />
              <span>Zero-Loss Offline Sync Engine</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Check className="w-4 h-4 text-primary shrink-0" strokeWidth={2.5} />
              <span>Official SRA 6-Stage Timeline</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Check className="w-4 h-4 text-primary shrink-0" strokeWidth={2.5} />
              <span>Weekly SRA Price Indexing</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Check className="w-4 h-4 text-primary shrink-0" strokeWidth={2.5} />
              <span>Audited Field Labor Accounting</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <Link
              to={isAuthenticated ? "/dashboard" : "/login"}
              className="inline-flex items-center justify-center gap-2 px-7 py-3 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-bold shadow-xs hover:shadow transition-all cursor-pointer"
            >
              <span>{isAuthenticated ? "Open Workspace Dashboard" : "Launch Web Console"}</span>
              <ArrowRight className="w-4 h-4" />
            </Link>

            <a
              href="https://github.com/Mattaeeee/HUGPONG/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-surface hover:bg-surface-subtle text-hug-text border border-border text-sm font-semibold shadow-2xs hover:border-primary/40 transition-all cursor-pointer"
            >
              <Download className="w-4 h-4 text-hug-muted" />
              <span>Download Android APK</span>
            </a>
          </div>
        </section>

        {/* Right Column: Purposeful 4-Pillar Feature Panel */}
        <section className="lg:col-span-6 w-full">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Pillar 1 */}
            <div className="p-5 rounded-2xl border border-border bg-surface shadow-xs hover:border-primary/30 transition-colors">
              <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-xs mb-3">
                01
              </div>
              <h2 className="text-sm font-bold text-hug-text">
                Offline-First Field Operations
              </h2>
              <p className="text-xs text-hug-muted mt-1 leading-relaxed">
                Reliable logging in remote cane plots with queued synchronization once connection is established.
              </p>
            </div>

            {/* Pillar 2 */}
            <div className="p-5 rounded-2xl border border-border bg-surface shadow-xs hover:border-primary/30 transition-colors">
              <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-xs mb-3">
                02
              </div>
              <h2 className="text-sm font-bold text-hug-text">
                Official SRA Price Monitoring
              </h2>
              <p className="text-xs text-hug-muted mt-1 leading-relaxed">
                Official millsite circulars for raw sugar and industrial molasses with regulatory verification.
              </p>
            </div>

            {/* Pillar 3 */}
            <div className="p-5 rounded-2xl border border-border bg-surface shadow-xs hover:border-primary/30 transition-colors">
              <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-xs mb-3">
                03
              </div>
              <h2 className="text-sm font-bold text-hug-text">
                Crop &amp; Field Tracking
              </h2>
              <p className="text-xs text-hug-muted mt-1 leading-relaxed">
                Chronological agronomic tracking across the 6 SRA sugarcane stages from land prep to harvest.
              </p>
            </div>

            {/* Pillar 4 */}
            <div className="p-5 rounded-2xl border border-border bg-surface shadow-xs hover:border-primary/30 transition-colors">
              <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-xs mb-3">
                04
              </div>
              <h2 className="text-sm font-bold text-hug-text">
                Audit-Ready Reports
              </h2>
              <p className="text-xs text-hug-muted mt-1 leading-relaxed">
                Tamper-resistant monthly compliance reports verifiable via QR code and printable to A4 standards.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="w-full px-6 sm:px-10 lg:px-16 py-5 border-t border-border flex flex-col md:flex-row items-center justify-between gap-3 text-xs font-semibold text-hug-muted relative z-30 bg-surface/90 backdrop-blur-md">
        <p>&copy; 2026 HUGPONG. Silay Sugarcane Block Farm &amp; SRA Governance Platform.</p>
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          <Link to="/privacy" className="hover:text-primary transition-colors">Privacy Policy (RA 10173)</Link>
          <Link to="/terms" className="hover:text-primary transition-colors">Terms of Use</Link>
          <Link to="/cookies" className="hover:text-primary transition-colors">Cookie Policy</Link>
          <Link to={isAuthenticated ? "/dashboard" : "/login"} className="hover:text-primary transition-colors">
            {isAuthenticated ? "Workspace Dashboard" : "Admin Gateway"}
          </Link>
          <a href="https://github.com/Mattaeeee/HUGPONG" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">
            GitHub
          </a>
        </div>
      </footer>

      {/* Consent Banner */}
      <ConsentBanner />
    </div>
  );
}
