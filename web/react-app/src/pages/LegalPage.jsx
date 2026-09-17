import PublicLayout from '../components/PublicLayout';

const policies = {
  privacy: {
    eyebrow: 'Republic Act No. 10173 Compliant', title: 'Privacy Policy & Data Protection Notice', meta: 'Effective Date: September 12, 2026 | Last Updated: September 12, 2026 | Version 2.4',
    sections: [
      ['Statement of Privacy Commitment', <><p>HUGPONG Agricultural Management Platform (“HUGPONG”, “we”, “our”, or “the Platform”) is committed to protecting the privacy, integrity, and confidentiality of the personal and agricultural data of users, sugarcane agrarian reform beneficiaries, block farm managers, and Sugar Regulatory Administration officers.</p><p>This notice describes how Personal Information and Sensitive Personal Information are processed under the Philippine Data Privacy Act of 2012 (Republic Act No. 10173), its IRR, and relevant National Privacy Commission issuances.</p></>],
      ['Information We Collect', <><p>HUGPONG processes the data needed for agricultural tracking, secure offline synchronization, and regulatory audit services:</p><ul><li>Farmer and user identifiers, mobile number, stable user ID, role, association, and server-side password hashes.</li><li>Field plots, block-farm affiliation, land area, soil, variety, and crop-cycle progress.</li><li>Operation and labor records, input costs, worker counts, vouchers, and timestamps.</li><li>Audit reports, certifications, amendments, and QR verification payloads.</li><li>Device and synchronization diagnostics used for troubleshooting.</li></ul></>],
      ['Lawful Basis & Purposes', <ul><li>Identity, role authentication, and farm registry administration.</li><li>SRA reporting, certification, and price publication.</li><li>Explicit offline mutation delivery and authenticated read-replica synchronization.</li><li>Fraud prevention, conflict detection, and immutable audit history.</li></ul>],
      ['Data Storage, Security & Encryption', <ul><li>Passwords are hashed server-side with salted scrypt and never delivered to clients.</li><li>Authenticated Express sessions and Firebase custom tokens enforce identity and scoped realtime reads.</li><li>Production transport must use TLS.</li><li>HUGPONG contains no commercial ad trackers or data brokers.</li></ul>],
      ['Your Rights as a Data Subject', <ul><li>To be informed about processing.</li><li>To access records associated with your identity.</li><li>To request rectification through authorized workflows.</li><li>To request account blocking, subject to statutory retention of submitted historical records.</li><li>To lodge a complaint with the National Privacy Commission.</li></ul>],
      ['Data Protection Officer Contact', <p><strong>HUGPONG Data Protection Office</strong><br/>Email: <a href="mailto:privacy@hugpong.gov.ph">privacy@hugpong.gov.ph</a><br/>Silay City Mill District, Negros Occidental, Philippines</p>]
    ]
  },
  terms: {
    eyebrow: 'Platform Service Agreement', title: 'Terms and Conditions of Use', meta: 'Effective Date: September 12, 2026 | Version 2.4 | Silay City Mill District',
    sections: [
      ['Acceptance of Terms', <p>By using HUGPONG web consoles or mobile field terminals, you agree to these Terms. Representatives of a cooperative or regulator affirm their authority to act for that entity.</p>],
      ['Role-Based Access & Account Integrity', <><p>HUGPONG uses four roles: Super Admin for system governance; SRA Admin for agricultural oversight, price publication, audits, and certification; Farm Manager for assigned block farms, fields, operations, and crop cycles; and Member Farmer for assigned-field mobile operations.</p><p>You are responsible for safeguarding your user ID and password. Account sharing is prohibited.</p></>],
      ['Offline Synchronization & Data Integrity', <p>Mobile actions are recorded as explicit queued mutations and delivered to the authoritative API after reconnection. Cached snapshot records do not create mutations, and stale changes may be rejected.</p>],
      ['Regulatory Compliance & Non-Repudiation', <p>Submitted operation logs are historical records with an ACTIVE to ARCHIVED lifecycle. Audit certification belongs to audit reports. Unauthorized alteration or falsification may be recorded in security audit history and reported under applicable law.</p>],
      ['Governing Law & Dispute Jurisdiction', <p>These Terms are governed by the laws of the Republic of the Philippines. Disputes shall be filed in the proper courts of Silay City, Negros Occidental.</p>]
    ]
  },
  cookies: {
    eyebrow: 'Transparent Web Storage Disclosure', title: 'Cookie & Local Storage Policy', meta: 'Effective Date: September 12, 2026 | Version 2.4',
    sections: [
      ['What Are Cookies & Local Storage?', <p>Cookies and web-storage technologies are device storage used to maintain sessions, cache authenticated read replicas, and support explicit offline mobile mutations.</p>],
      ['How HUGPONG Uses Local Storage', <><p>Storage is used only for necessary operation:</p><ul><li><code>hugpong_auth_token</code>, <code>hugpong_user</code>, and <code>hugpong_role</code>: authenticated web session restoration data.</li><li><code>hugpong_react_replica_v1:&lt;userId&gt;</code>: per-user read-only Firestore replica cache.</li><li>Mobile AsyncStorage: the local replica and explicit mutation outbox.</li><li><code>hugpong_cookie_consent</code>: acknowledgement of this notice.</li></ul></>],
      ['Zero Third-Party Advertising Trackers', <p>HUGPONG does not install third-party advertising cookies, retargeting pixels, or commercial tracking scripts, and does not share agricultural or personal data with advertiser networks.</p>],
      ['Managing Your Storage Preferences', <p>You may sign out or clear site storage through browser settings. On mobile, do not clear application storage while explicit mutations remain pending, because unsent local work could be lost.</p>]
    ]
  }
};

export default function LegalPage({ document }) {
  const policy = policies[document];
  return <PublicLayout><main className="mx-auto max-w-4xl px-6 py-12"><p className="text-xs font-extrabold uppercase tracking-wider text-hug-primary">{policy.eyebrow}</p><h1 className="mt-3 text-3xl font-black text-slate-950 sm:text-4xl">{policy.title}</h1><p className="mt-2 text-sm text-hug-muted">{policy.meta}</p>
    <div className="legal-copy mt-10 space-y-8">{policy.sections.map(([title, content], index) => <section key={title} className="rounded-2xl border border-hug-border bg-white p-6"><h2 className="text-lg font-extrabold text-slate-900"><span className="mr-2 text-hug-primary">{index + 1}.</span>{title}</h2><div className="mt-3 space-y-3 text-sm leading-7 text-slate-700">{content}</div></section>)}</div>
  </main></PublicLayout>;
}
