import React, { useEffect, useState } from 'react';
import { CalendarRange, Printer } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Select from '../ui/Select';
import { fetchCropYearOptions, previewCropYear, fetchCropYearCompilations, compileCropYear, printCropYearCompilation } from '../../services/cropYearCompilationService';

const money = value => Number(value || 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });

export default function CropYearCompilationModal({ onClose }) {
  const [options, setOptions] = useState(null);
  const [cropYearCycle, setYear] = useState('');
  const [blockFarmId, setFarm] = useState('');
  const [preview, setPreview] = useState(null);
  const [history, setHistory] = useState([]);
  const [current, setCurrent] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [optionsBusy, setOptionsBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setOptionsBusy(true);
    fetchCropYearOptions().then(response => {
      if (!active) return;
      setOptions(response.data);
      setYear(year => year || response.data.cropYearCycles[0] || '');
    }).catch(reason => { if (active) setError(reason.message); })
      .finally(() => { if (active) setOptionsBusy(false); });
    return () => { active = false; };
  }, [reload]);

  useEffect(() => {
    if (!cropYearCycle) return undefined;
    let active = true;
    setBusy(true); setError(''); setPreview(null); setCurrent(null); setHistory([]); setCursor(null);
    Promise.all([previewCropYear({ cropYearCycle, blockFarmId }), fetchCropYearCompilations({ cropYearCycle, blockFarmId })])
      .then(([nextPreview, saved]) => {
        if (!active) return;
        setPreview(nextPreview.data); setHistory(saved.data); setCursor(saved.nextCursor);
      }).catch(reason => { if (active) setError(reason.message); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [cropYearCycle, blockFarmId, reload]);

  const save = async () => {
    setSaving(true); setError('');
    try {
      const response = await compileCropYear({ cropYearCycle, blockFarmId });
      setCurrent(response.data); setPreview(response.data);
      setHistory(rows => [response.data, ...rows.filter(row => row.id !== response.data.id)]);
    } catch (reason) { setError(reason.message); }
    finally { setSaving(false); }
  };
  const more = async () => {
    setSaving(true); setError('');
    try {
      const response = await fetchCropYearCompilations({ cropYearCycle, blockFarmId, cursor });
      setHistory(rows => [...rows, ...response.data.filter(row => !rows.some(existing => existing.id === row.id))]); setCursor(response.nextCursor);
    } catch (reason) { setError(reason.message); }
    finally { setSaving(false); }
  };
  const print = async () => {
    setSaving(true); setError('');
    try { await printCropYearCompilation(current.id); }
    catch (reason) { setError(reason.message); }
    finally { setSaving(false); }
  };
  const report = current || preview;
  const loading = busy || optionsBusy;

  return <Modal isOpen onClose={onClose} title="Crop Year Compilations" subtitle="Combine certified monthly reports into a Crop Year overview." icon={CalendarRange} size="xl" isLoading={saving}>
    <div className="space-y-5">
      <p className="text-sm text-hug-muted">Monthly certification continues as usual. Only certified operations from the selected crop year are included. Each operation and field is counted once.</p>
      {error && <div role="alert" className="rounded-xl border border-danger/30 bg-danger-bg p-3 text-sm text-danger">{error}<button className="ml-3 underline" onClick={() => setReload(value => value + 1)} disabled={saving || loading}>Retry</button></div>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold text-hug-text">Crop Year Cycle<Select value={cropYearCycle} onChange={event => setYear(event.target.value)} disabled={loading || saving} placeholder="Select crop year" options={(options?.cropYearCycles || []).map(year => ({ value: year, label: year }))} /></label>
        <label className="text-xs font-bold text-hug-text">Block Farm<Select value={blockFarmId} onChange={event => setFarm(event.target.value)} disabled={loading || saving} options={[{ value: '', label: 'All Block Farms' }, ...(options?.blockFarms || []).map(farm => ({ value: farm.id, label: farm.name }))]} /></label>
      </div>
      {loading ? <p role="status" className="text-sm text-hug-muted">Loading certified reports…</p> : !cropYearCycle && options ? <p className="rounded-xl bg-surface-subtle p-5 text-sm text-hug-muted">No certified monthly reports with Crop Year data are available yet.</p> : report && <>
        <div className="rounded-xl border border-border bg-surface-subtle p-4">
          <p className="text-xs font-bold uppercase text-primary">{current ? 'Saved compilation' : 'Current preview'} · {report.cropYearCycle}</p>
          <p className="mt-2 text-sm font-bold text-hug-text">{report.sourceReportCount} certified reports · {report.monthCount} reporting months · {report.blockFarmCount} Block Farms</p>
          <p className="mt-1 text-sm text-hug-text">{report.operationCount} operations · {report.fieldCount} fields · {report.memberCount} members · {report.hectaresAudited} ha</p>
          <p className="mt-2 text-xl font-black text-hug-text">{money(report.totalCost)}</p>
          <p className="mt-2 text-xs text-hug-muted">Certified reports to date. This does not declare that the crop year is complete. Area uses each field’s latest included monthly snapshot.</p>
          {current && <p className="mt-2 break-all text-xs text-hug-muted">{current.id} · Compiled {new Date(current.compiledAt).toLocaleString()} by {current.compiledByName}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={saving || loading || !preview?.operationCount}>{saving ? 'Please wait…' : 'Compile Crop Year'}</Button>
          <Button variant="secondary" onClick={() => setReload(value => value + 1)} disabled={saving || loading}>Refresh certified reports</Button>
          {current && <Button variant="secondary" onClick={print} disabled={saving} icon={Printer}>Print / Save PDF</Button>}
        </div>
        {!report.operationCount && <p className="text-sm text-hug-muted">No certified monthly operations match this selection.</p>}
        {!!report.monthlySummaries.length && <div className="overflow-x-auto rounded-xl border border-border"><table className="w-full text-left text-sm"><caption className="p-3 text-left font-bold text-hug-text">Included monthly totals</caption><thead className="bg-surface-subtle text-xs text-hug-muted"><tr><th className="p-3">Month</th><th className="p-3">Farms</th><th className="p-3">Operations</th><th className="p-3">Cost</th></tr></thead><tbody>{report.monthlySummaries.map(month => <tr key={month.periodKey} className="border-t border-border"><td className="p-3">{month.periodKey}</td><td className="p-3">{month.blockFarmCount}</td><td className="p-3">{month.operationCount}</td><td className="p-3">{money(month.totalCost)}</td></tr>)}</tbody></table></div>}
        {!!report.farmSummaries.length && <div className="space-y-2"><h3 className="font-bold text-hug-text">Block Farm totals</h3>{report.farmSummaries.map(farm => <div key={farm.blockFarmId} className="flex flex-wrap justify-between gap-2 rounded-xl border border-border p-3 text-sm"><span>{farm.blockFarmName} · {farm.fieldCount} fields · {farm.hectaresAudited} ha</span><strong>{money(farm.totalCost)}</strong></div>)}</div>}
        {current && <details className="rounded-xl border border-border p-3 text-xs"><summary className="cursor-pointer font-bold">Certified source reports ({current.sourceReportCount})</summary>{current.sourceReports.map(source => <p key={source.reportId} className="mt-2 break-all">{source.reportId} · {source.periodKey} · Certified by {source.certifiedByUserId}</p>)}</details>}
      </>}
      {!!history.length && <div className="space-y-2 border-t border-border pt-4"><h3 className="font-bold text-hug-text">Saved compilations</h3><p className="text-xs text-hug-muted">Saving the same certified sources reopens the existing compilation. Later certifications create a new snapshot.</p>{history.map(item => <button key={item.id} disabled={saving || loading} onClick={() => setCurrent(item)} className={`block w-full rounded-xl border p-3 text-left text-sm ${current?.id === item.id ? 'border-primary bg-primary-bg' : 'border-border'}`}><strong>{item.cropYearCycle} · {money(item.totalCost)}</strong><span className="mt-1 block text-xs text-hug-muted">{item.sourceReportCount} reports · {new Date(item.compiledAt).toLocaleString()}</span></button>)}{cursor && <Button variant="secondary" onClick={more} disabled={saving || loading}>Load more compilations</Button>}</div>}
    </div>
  </Modal>;
}
