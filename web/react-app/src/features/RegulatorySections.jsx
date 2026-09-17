import { useMemo, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { QRCodeSVG } from 'qrcode.react';
import { buttonClass, Card, Empty, Field, inputClass, Notice, secondaryButtonClass, Section, Status, Table } from '../components/Ui';
import { selectDashboardScope } from '../domain/dashboardSelectors';
import { useAction } from '../hooks/useAction';
import { auditsApi, pricesApi } from '../services/domainApi';
import { assertCanonicalPrice } from '../domain/priceModel';

export function PricesSection({ replica, session }) {
  const action = useAction();
  const prices = (replica.priceHistory || []).map(assertCanonicalPrice);
  const previous = prices[0] || null;
  const [form, setForm] = useState({ effectiveDate: new Date().toISOString().slice(0, 10), weekLabel: '', sugarPricePerLkg: '', molassesPricePerMetricTon: '', circularNumber: '', source: 'Sugar Regulatory Administration' });
  async function publish(event) {
    event.preventDefault();
    await action.run(() => pricesApi.publish(form, previous), 'Canonical SRA price published.').catch(() => undefined);
  }
  return <Section title="SRA Price Monitoring" description="Canonical prices retain machine-readable effective dates. Price changes are derived from the latest persisted publication.">
    <Notice {...action} />
    {session.roleKey === 'admin' && <Card><details><summary className="cursor-pointer font-extrabold text-hug-primary">Publish weekly price</summary><form onSubmit={publish} className="mt-5 grid gap-4 md:grid-cols-3">
      <Field label="Effective date"><input required type="date" className={inputClass} value={form.effectiveDate} onChange={e => setForm({ ...form, effectiveDate: e.target.value })} /></Field>
      <Field label="Week / period label"><input required className={inputClass} value={form.weekLabel} onChange={e => setForm({ ...form, weekLabel: e.target.value })} /></Field>
      <Field label="Sugar price per LKG"><input required type="number" min="0" step="0.01" className={inputClass} value={form.sugarPricePerLkg} onChange={e => setForm({ ...form, sugarPricePerLkg: e.target.value })} /></Field>
      <Field label="Molasses price per metric ton"><input required type="number" min="0" step="0.01" className={inputClass} value={form.molassesPricePerMetricTon} onChange={e => setForm({ ...form, molassesPricePerMetricTon: e.target.value })} /></Field>
      <Field label="Circular number"><input required className={inputClass} value={form.circularNumber} onChange={e => setForm({ ...form, circularNumber: e.target.value })} /></Field>
      <Field label="Source"><input required className={inputClass} value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} /></Field>
      <div className="flex items-end"><button className={buttonClass} disabled={action.busy}>Publish price</button></div>
    </form></details></Card>}
    <Table rows={prices} columns={[
      { key: 'effectiveDate', label: 'Effective Date' }, { key: 'weekLabel', label: 'Period' },
      { key: 'sugarPricePerLkg', label: 'Sugar / LKG', render: row => `₱${Number(row.sugarPricePerLkg).toLocaleString()}` },
      { key: 'sugarPriceChange', label: 'Sugar Change' },
      { key: 'molassesPricePerMetricTon', label: 'Molasses / MT', render: row => `₱${Number(row.molassesPricePerMetricTon).toLocaleString()}` },
      { key: 'molassesPriceChange', label: 'Molasses Change' }, { key: 'circularNumber', label: 'Circular' }, { key: 'source', label: 'Source' }
    ]} />
  </Section>;
}

export function ReportsSection({ replica, session }) {
  const action = useAction();
  const scope = useMemo(() => selectDashboardScope(replica, session), [replica, session]);
  const reports = (replica.auditReports || []).filter(report => session.roleKey !== 'manager' || scope.farms.some(farm => farm.id === report.blockFarmId));
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [blockFarmId, setBlockFarmId] = useState('');
  const [selectedLogs, setSelectedLogs] = useState([]);
  const [certifying, setCertifying] = useState(null);
  const [notes, setNotes] = useState('');
  const [verification, setVerification] = useState('');
  const [verifiedReport, setVerifiedReport] = useState(null);
  const eligibleLogs = scope.logs.filter(log => log.status === 'ACTIVE' && String(log.performedOn).startsWith(`${period}-`) && scope.fields.some(field => field.id === log.fieldId && (!blockFarmId || field.blockFarmId === blockFarmId)));

  async function compile(event) {
    event.preventDefault();
    await action.run(() => auditsApi.compile({ blockFarmId, period, operationLogIds: selectedLogs }), 'Monthly audit report compiled for SRA review.').catch(() => undefined);
    setSelectedLogs([]);
  }
  async function certify(event) {
    event.preventDefault();
    await action.run(() => auditsApi.certify(certifying, notes), 'Audit report certified by the SRA workflow.').catch(() => undefined);
    setCertifying(null); setNotes('');
  }
  function verifyValue(value) {
    const match = reports.find(report => report.qrHash === String(value || '').trim());
    setVerifiedReport(match || false);
  }
  async function scanFile(event) {
    const file = event.target.files?.[0]; if (!file) return;
    action.clear();
    try {
      const scanner = new Html5Qrcode('react-qr-reader');
      const decoded = await scanner.scanFile(file, true);
      setVerification(decoded); verifyValue(decoded);
      await scanner.clear().catch(() => undefined);
    } catch (cause) { setVerifiedReport(false); }
  }
  return <Section title="Reports, Audit & Certification" description="Farm Managers compile immutable operation snapshots. Certification belongs only to the SRA audit-report workflow.">
    <Notice {...action} />
    {session.roleKey === 'manager' && <Card><form onSubmit={compile} className="space-y-4">
      <h3 className="font-extrabold text-hug-primary">Compile monthly report</h3><div className="grid gap-4 md:grid-cols-2">
        <Field label="Block farm"><select required className={inputClass} value={blockFarmId} onChange={e => { setBlockFarmId(e.target.value); setSelectedLogs([]); }}><option value="">Select</option>{scope.farms.map(farm => <option key={farm.id} value={farm.id}>{farm.name}</option>)}</select></Field>
        <Field label="Report period"><input required type="month" className={inputClass} value={period} onChange={e => { setPeriod(e.target.value); setSelectedLogs([]); }} /></Field>
      </div>
      <div className="max-h-64 space-y-2 overflow-auto rounded-xl border border-hug-border p-3">{eligibleLogs.length ? eligibleLogs.map(log => <label key={log.id} className="flex items-center gap-3 text-sm"><input type="checkbox" checked={selectedLogs.includes(log.id)} onChange={e => setSelectedLogs(e.target.checked ? [...selectedLogs, log.id] : selectedLogs.filter(id => id !== log.id))} /><span>{log.performedOn} · {log.fieldId} · {log.operationName}</span></label>) : <p className="text-sm text-hug-muted">No eligible ACTIVE operations for this farm and month.</p>}</div>
      <button className={buttonClass} disabled={action.busy || !selectedLogs.length}>Compile report</button>
    </form></Card>}
    {certifying && <Card><form onSubmit={certify} className="space-y-4"><h3 className="font-extrabold">Certify {certifying.id}</h3><Field label="Certification notes"><textarea className={inputClass} rows="3" value={notes} onChange={e => setNotes(e.target.value)} /></Field><div className="flex gap-2"><button className={buttonClass}>Certify report</button><button type="button" className={secondaryButtonClass} onClick={() => setCertifying(null)}>Cancel</button></div></form></Card>}
    <Card><h3 className="font-extrabold text-hug-primary">QR verification</h3><div id="react-qr-reader" className="hidden" /><div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto_auto]"><input className={inputClass} placeholder="Enter or scan report QR hash" value={verification} onChange={e => setVerification(e.target.value)} /><button className={secondaryButtonClass} onClick={() => verifyValue(verification)}>Verify</button><label className={`${secondaryButtonClass} cursor-pointer text-center`}>Scan image<input type="file" accept="image/*" className="hidden" onChange={scanFile} /></label></div>
      {verifiedReport && <p className="mt-3 rounded-xl bg-green-50 p-3 text-sm font-bold text-green-800">Verified {verifiedReport.id}: {verifiedReport.status}</p>}
      {verifiedReport === false && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">No canonical audit report matches this QR value.</p>}
    </Card>
    {reports.length ? <div className="grid gap-4 xl:grid-cols-2">{reports.map(report => <Card key={report.id}><div className="flex gap-4"><QRCodeSVG value={report.qrHash} size={96} /><div className="min-w-0 flex-1"><div className="flex justify-between gap-2"><h3 className="truncate font-extrabold">{report.id}</h3><Status value={report.status} /></div><p className="mt-2 text-sm text-hug-muted">{report.blockFarmId} · {report.period} · {(report.operationSnapshots || []).length} operations</p><p className="mt-1 break-all text-xs text-hug-muted">{report.qrHash}</p><div className="mt-3 flex gap-2">{session.roleKey === 'admin' && report.status === 'PENDING' && <button className={buttonClass} onClick={() => setCertifying(report)}>Certify</button>}<button className={secondaryButtonClass} onClick={() => window.print()}>Print</button></div></div></div></Card>)}</div> : <Empty>No audit reports are available.</Empty>}
  </Section>;
}
