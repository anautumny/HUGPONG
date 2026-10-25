import React, { useState } from 'react';
import Button from '../ui/Button';
import Select from '../ui/Select';
import Modal from '../ui/Modal';
import { Filter } from 'lucide-react';

export default function ArchiveFilters({ filters, onApply, years, fields, operations }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(filters);
  const definitions = [
    ['cropYearCycle', 'Crop year', years], ['fieldId', 'Plot', fields], ['operationDefinitionId', 'Operation', operations],
  ];
  const count = definitions.filter(([key]) => filters[key]).length;
  const summary = definitions.map(([key, , options]) => options.find(option => option.value === filters[key])?.label).filter(Boolean).join(' · ');
  return <div className="flex flex-wrap items-center justify-between gap-3">
    <p className="min-w-0 flex-1 text-xs text-hug-muted">{summary}</p>
    <Button variant="secondary" size="sm" icon={Filter} onClick={() => { setDraft(filters); setOpen(true); }}>Filters{count ? ` (${count})` : ''}</Button>
    <Modal isOpen={open} onClose={() => setOpen(false)} title="Filter past cycles" size="sm" closeOnBackdrop
      footer={<><Button variant="ghost" onClick={() => setDraft(value => ({ ...value, cropYearCycle: '', fieldId: '', operationDefinitionId: '' }))}>Reset</Button><Button variant="primary" onClick={() => { onApply(draft); setOpen(false); }}>Apply filters</Button></>}>
      {definitions.map(([key, label, options]) => <label key={key} className="block space-y-1.5"><span className="text-xs font-semibold text-hug-muted">{label}</span><Select aria-label={label} value={draft[key] || ''} onChange={event => setDraft(value => ({ ...value, [key]: event.target.value }))} options={options} /></label>)}
    </Modal>
  </div>;
}
