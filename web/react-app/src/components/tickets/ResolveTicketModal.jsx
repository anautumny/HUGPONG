import React, { useState, useEffect } from 'react';
import { Wrench, CheckCircle2, AlertCircle } from 'lucide-react';
import Modal from '../ui/Modal';
import FormField from '../ui/FormField';
import Select from '../ui/Select';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';
import { updateTicket, TICKET_STATUSES, TICKET_PRIORITIES } from '../../services/ticketsService';

export default function ResolveTicketModal({
  isOpen = false,
  onClose,
  ticket = null,
  onUpdated
}) {
  const [status, setStatus] = useState('IN_PROGRESS');
  const [priority, setPriority] = useState('NORMAL');
  const [resolutionNotes, setResolutionNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    if (isOpen && ticket) {
      setStatus(ticket.status || 'IN_PROGRESS');
      setPriority(ticket.priority || 'NORMAL');
      setResolutionNotes(ticket.resolutionNotes || '');
      setFormError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, ticket]);

  const statusOptions = TICKET_STATUSES.map(s => ({
    value: s,
    label: s.replace(/_/g, ' ')
  }));

  const priorityOptions = TICKET_PRIORITIES.map(p => ({
    value: p,
    label: `${p.charAt(0) + p.slice(1).toLowerCase()} Priority`
  }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!ticket) return;
    setFormError(null);
    setIsSubmitting(true);

    try {
      const payload = {
        status,
        priority,
        resolutionNotes: resolutionNotes.trim()
      };

      const res = await updateTicket(ticket.id, payload);
      if (res.success) {
        if (onUpdated) onUpdated(res.data);
        onClose();
      } else {
        setFormError(res.error || 'Failed to update ticket.');
      }
    } catch (err) {
      setFormError(err.message || 'Error updating ticket.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!ticket) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Manage & Resolve Ticket"
      subtitle={`Resolution controls for ${ticket.id} (${ticket.title})`}
      icon={Wrench}
      badge="Super Admin"
      size="md"
      preventBackdropClose={isSubmitting}
      preventEscapeClose={isSubmitting}
      isLoading={isSubmitting}
      footer={
        <div className="flex items-center justify-end gap-2.5 w-full">
          <Button
            variant="ghost"
            size="md"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleSubmit}
            isLoading={isSubmitting}
            icon={CheckCircle2}
          >
            Update Ticket
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {formError && (
          <div className="p-3 bg-danger-bg/40 border border-danger/30 rounded-xl flex items-start gap-2 text-xs font-semibold text-danger">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{formError}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField
            id="tck-update-status"
            label="Ticket Status"
            required
          >
            <Select
              id="tck-update-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              options={statusOptions}
              disabled={isSubmitting}
            />
          </FormField>

          <FormField
            id="tck-update-priority"
            label="Priority Level"
            required
          >
            <Select
              id="tck-update-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              options={priorityOptions}
              disabled={isSubmitting}
            />
          </FormField>
        </div>

        <FormField
          id="tck-resolution-notes"
          label="Resolution Notes & Actions Taken"
          helperText="Explain the corrective action or resolution for the member/manager"
        >
          <Textarea
            id="tck-resolution-notes"
            rows={4}
            placeholder="Document administrative resolution or technical findings..."
            value={resolutionNotes}
            onChange={(e) => setResolutionNotes(e.target.value)}
            disabled={isSubmitting}
          />
        </FormField>
      </form>
    </Modal>
  );
}
