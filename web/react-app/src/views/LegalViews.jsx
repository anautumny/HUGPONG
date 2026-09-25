import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, FileText, Database, Scale } from 'lucide-react';
import legalPolicy from '../domain/legalPolicy.json';

function LegalLayout({ title, subtitle, badge, icon: Icon, children }) {
  return (
    <div className="min-h-screen py-10 px-4 sm:px-6 lg:px-8 bg-bg text-hug-text">
      <div className="max-w-4xl mx-auto bg-surface rounded-2xl border border-border p-6 sm:p-10 md:p-12 shadow-sm">
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

        <div className="prose dark:prose-invert max-w-none text-xs sm:text-sm text-hug-text2 space-y-6 leading-relaxed">
          {children}
        </div>

        <div className="mt-10 pt-6 border-t border-border/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-hug-muted">
          <p>&copy; 2026 HUGPONG Agricultural Platform.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/privacy" className="hover:text-primary">Privacy Policy</Link>
            <span aria-hidden="true">&middot;</span>
            <Link to="/terms" className="hover:text-primary">Terms of Use</Link>
            <span aria-hidden="true">&middot;</span>
            <Link to="/compliance" className="hover:text-primary">Compliance</Link>
            <span aria-hidden="true">&middot;</span>
            <Link to="/cookies" className="hover:text-primary">Storage</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function LegalDocument({ document, icon }) {
  const Icon = icon;
  return (
    <LegalLayout title={document.title} subtitle={document.subtitle} badge={document.badge} icon={Icon}>
      {document.sections.map(section => (
        <section className="space-y-2" key={section.heading}>
          <h2 className="text-base font-bold text-hug-text">{section.heading}</h2>
          {section.paragraphs?.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
          {section.bullets?.length ? (
            <ul className="list-disc list-outside space-y-1 pl-5">
              {section.bullets.map(item => <li key={item}>{item}</li>)}
            </ul>
          ) : null}
        </section>
      ))}
      <p className="pt-4 text-xs text-hug-muted border-t border-border/80">
        Effective {legalPolicy.effectiveDate} &middot; Version {legalPolicy.version}
      </p>
    </LegalLayout>
  );
}

export function PrivacyPolicyView() {
  return <LegalDocument document={legalPolicy.privacy} icon={ShieldCheck} />;
}

export function TermsView() {
  return <LegalDocument document={legalPolicy.terms} icon={FileText} />;
}

export function ComplianceView() {
  return <LegalDocument document={legalPolicy.compliance} icon={Scale} />;
}

export function CookiePolicyView() {
  return <LegalDocument document={legalPolicy.storage} icon={Database} />;
}
