import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, FileText, Database } from 'lucide-react';

function LegalLayout({ title, subtitle, badge, icon: Icon, children }) {
  return (
    <div className="min-h-screen py-10 px-4 sm:px-6 lg:px-8 bg-bg text-hug-text">
      <div className="max-w-4xl mx-auto bg-surface rounded-2xl border border-border p-6 sm:p-10 md:p-12 shadow-sm">
        {/* Top Header */}
        <div className="flex items-center justify-between pb-6 border-b border-border/80 mb-8">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-primary dark:text-primary-light hover:underline transition-colors focus:ring-2 focus:ring-primary focus:outline-none rounded-lg px-2 py-1"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Home</span>
          </Link>
          <div className="flex items-center gap-3">
            <div className="brand-logo-box w-8 h-8 rounded-xl bg-white border border-border/80 p-1 flex items-center justify-center">
              <img src="/logo.png" alt="HUGPONG" className="w-full h-full object-contain" />
            </div>
            <span className="font-display font-black text-sm text-hug-text">HUGPONG</span>
          </div>
        </div>

        {/* Document Title Header */}
        <div className="space-y-3 mb-8">
          {badge && (
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-bg dark:bg-primary/20 text-primary dark:text-primary-light text-[11px] font-bold uppercase tracking-wider">
              {Icon && <Icon className="w-3.5 h-3.5" />}
              <span>{badge}</span>
            </div>
          )}
          <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl font-extrabold text-hug-text tracking-tight">
            {title}
          </h1>
          <p className="text-xs sm:text-sm text-hug-muted">{subtitle}</p>
        </div>

        {/* Content Body */}
        <div className="prose dark:prose-invert max-w-none text-xs sm:text-sm text-hug-text2 space-y-6 leading-relaxed">
          {children}
        </div>

        {/* Document Footer */}
        <div className="mt-10 pt-6 border-t border-border/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-hug-muted">
          <p>&copy; 2026 HUGPONG. Silay Sugar Regulatory Administration.</p>
          <div className="flex gap-4">
            <Link to="/privacy" className="hover:text-primary">Privacy Policy</Link>
            <span>•</span>
            <Link to="/terms" className="hover:text-primary">Terms of Use</Link>
            <span>•</span>
            <Link to="/cookies" className="hover:text-primary">Cookie Policy</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PrivacyPolicyView() {
  return (
    <LegalLayout
      title="Privacy Policy & Data Protection Notice"
      subtitle="Comprehensive policy for processing agricultural records and personnel credentials."
      badge="Republic Act No. 10173 Compliant"
      icon={ShieldCheck}
    >
      <section className="space-y-2">
        <h2 className="text-base font-bold text-hug-text">1. Statutory Framework & Commitment</h2>
        <p>
          HUGPONG operates in strict compliance with Republic Act No. 10173, otherwise known as the Data Privacy Act of 2012 (DPA), its Implementing Rules and Regulations (IRR), and regulatory issuances from the Sugar Regulatory Administration (SRA) and National Privacy Commission (NPC).
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-bold text-hug-text">2. Information We Collect</h2>
        <p>We process only information strictly necessary for sugar block farm governance and milling allocation:</p>
        <ul className="list-disc list-inside space-y-1 pl-2">
          <li><strong>Identity & Credentials:</strong> Official display name, mobile telephone number, authorized employee ID, and salted cryptographic password hashes.</li>
          <li><strong>Agronomic Records:</strong> Field plot coordinates, hectare measurements, cane variety (e.g. PHIL 2006-2289), crop year, planting cycle, and fertilizer logs.</li>
          <li><strong>Audit Trail:</strong> Cryptographic operation records, digital timestamps, and verification identifiers.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-bold text-hug-text">3. Regulatory Purpose</h2>
        <p>
          Data collected is utilized exclusively for cooperative allocation tracking, SRA official price indexing, agronomic support, and compliance certification under SRA regulatory supervision. Data is never monetized, profiled for advertising, or shared with unauthorized commercial entities.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-bold text-hug-text">4. Security Measures</h2>
        <p>
          All communications are secured via Transport Layer Security (TLS 1.3). Credentials utilize salted scrypt key-derivation algorithms. Real-time data listeners enforce granular Firestore Security Rules denying unauthorized client write privileges.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-bold text-hug-text">5. Rights of the Data Subject</h2>
        <p>
          Under RA 10173, registered Farm Members and authorized admins possess the right to be informed, to access, to dispute inaccuracies, and to lodge inquiries with the SRA District Data Protection Officer.
        </p>
      </section>
    </LegalLayout>
  );
}

export function TermsView() {
  return (
    <LegalLayout
      title="Terms of Use & Operating Conditions"
      subtitle="Rules governing platform access, agronomic declarations, and regulatory compliance."
      badge="Official Operating Agreement"
      icon={FileText}
    >
      <section className="space-y-2">
        <h2 className="text-base font-bold text-hug-text">1. Scope of Authorization</h2>
        <p>
          HUGPONG is an official digital governance and agricultural management system for Silay sugarcane block farms. Access is restricted to registered Farm Members, certified Farm Managers, SRA Admins, and Platform Governance personnel.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-bold text-hug-text">2. Truthful Operational Declarations</h2>
        <p>
          All logged operations, including crop stage updates, fertilizer inputs, and harvest tonnage, constitute formal regulatory records. Users agree to submit truthful, accurate field data in accordance with SRA agronomic timelines.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-bold text-hug-text">3. Account Security & Credential Protection</h2>
        <p>
          Account holders must safeguard their access credentials and 6-digit SMS OTP challenges. Credential sharing is strictly prohibited under cooperative bylaws and regulatory directives.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-bold text-hug-text">4. Offline Data Synchronization</h2>
        <p>
          Operations recorded during offline field conditions remain staged in the durable local outbox and synchronize atomically once network connectivity is restored.
        </p>
      </section>
    </LegalLayout>
  );
}

export function CookiePolicyView() {
  return (
    <LegalLayout
      title="Cookie & Local Storage Policy"
      subtitle="Transparent disclosure of local storage tokens and offline cache usage."
      badge="Essential Storage Notice"
      icon={Database}
    >
      <section className="space-y-2">
        <h2 className="text-base font-bold text-hug-text">1. Strictly Essential Storage Only</h2>
        <p>
          HUGPONG does <strong>not</strong> use advertising cookies, commercial tracking pixels, or third-party behavioral analytics. The application utilizes strictly essential browser storage to support authenticated sessions and offline field resilience.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-bold text-hug-text">2. Storage Keys Utilized</h2>
        <ul className="list-disc list-inside space-y-1 pl-2">
          <li><strong>hugpong_auth_token:</strong> Ephemeral cryptographic bearer token for authorized API sessions.</li>
          <li><strong>hugpong_user / hugpong_role:</strong> Cached session profile enabling offline UI degradation when cell towers are unreachable.</li>
          <li><strong>hugpong_theme:</strong> User appearance preference (Light / Dark / Auto).</li>
          <li><strong>hugpong_sidebar_collapsed:</strong> UI navigation drawer width preference.</li>
          <li><strong>hugpong_cookie_consent:</strong> Proof of acknowledgment for RA 10173 data privacy disclosures.</li>
        </ul>
      </section>
    </LegalLayout>
  );
}
