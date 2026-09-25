import React, { useRef, useState } from 'react';
import { LifeBuoy, AlertCircle, Send } from 'lucide-react';
import Modal from '../ui/Modal';
import FormField from '../ui/FormField';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';
import { createTicket, TICKET_CATEGORIES } from '../../services/ticketsService';

export default function CreateTicketModal({
  isOpen = false,
  onClose,
  fields = [],
  user = {},
  onCreated
}) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(TICKET_CATEGORIES[0]);
  const [fieldId, setFieldId] = useState('');
  const [details, setDetails] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const submitLock = useRef(false);

  const categoryOptions = TICKET_CATEGORIES.map(c => ({ value: c, label: c }));
  const fieldOptions = [
    { value: '', label: 'None / General Issue' },
    ...fields.map(f => ({ value: f.id, label: `${f.id} (${f.blockFarmName || 'Plot'})` }))
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitLock.current) return;
    setFormError(null);

    if (!title.trim()) {
      setFormError('Subject is required.');
      return;
    }
    if (!details.trim()) {
      setFormError('Description is required.');
      return;
    }

    submitLock.current = true;
    setIsSubmitting(true);

    try {
      const payload = {
        title: title.trim(),
        category,
        priority: 'NORMAL',
        fieldId: fieldId || null,
        details: details.trim()
      };

      const res = await createTicket(payload, user);
      if (res.success) {
        if (onCreated) onCreated(res.data, res.queued === true);
        setTitle('');
        setDetails('');
        setFieldId('');
        onClose();
      } else {
        setFormError(res.error || 'Failed to submit ticket.');
      }
    } catch (err) {
      setFormError(err.message || 'An error occurred during submission.');
    } finally {
      submitLock.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Support Ticket"
      subtitle="Ask the HUGPONG Super Admin for help."
      icon={LifeBuoy}
      badge="Support Desk"
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
            icon={Send}
          >
            Submit Ticket
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

        <FormField
          id="tck-title"
          label="Subject"
          required
          helperText="Brief summary of the issue or assistance required"
        >
          <Input
            type="text"
            id="tck-title"
            placeholder="e.g. Submitted operation is still pending"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isSubmitting}
            required
          />
        </FormField>

        <div className="grid grid-cols-1 gap-3">
          <FormField
            id="tck-category"
            label="Category"
            required
          >
            <Select
              id="tck-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              options={categoryOptions}
              disabled={isSubmitting}
            />
          </FormField>

        </div>

        {fields.length > 0 && (
          <FormField
            id="tck-field"
            label="Associated Parcel (Optional)"
            helperText="Link issue directly to a registered sugarcane plot"
          >
            <Select
              id="tck-field"
              value={fieldId}
              onChange={(e) => setFieldId(e.target.value)}
              options={fieldOptions}
              disabled={isSubmitting}
            />
          </FormField>
        )}

        <FormField
          id="tck-details"
          label="Description"
          helperText="Describe what happened and what help you need"
          required
        >
          <Textarea
            id="tck-details"
            rows={4}
            placeholder="Describe the issue in detail..."
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            disabled={isSubmitting}
            required
          />
        </FormField>
      </form>
    </Modal>
  );
}
