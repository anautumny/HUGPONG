import React, { useState, useEffect } from 'react';
import { LifeBuoy, PlusCircle, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { subscribeToTicketsData } from '../../services/ticketsService';
import { subscribeToFieldsData } from '../../services/fieldsService';
import TicketList from '../../components/tickets/TicketList';
import CreateTicketModal from '../../components/tickets/CreateTicketModal';
import ResolveTicketModal from '../../components/tickets/ResolveTicketModal';
import Button from '../../components/ui/Button';

export default function TicketsView() {
  const { user } = useAuth();
  const isSuperAdmin = String(user?.role || user?.roleKey || '').toUpperCase().replace(/ /g, '_') === 'SUPER_ADMIN';

  const [tickets, setTickets] = useState([]);
  const [fields, setFields] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [ticketToResolve, setTicketToResolve] = useState(null);

  useEffect(() => {
    setIsLoading(true);
    const unsubTickets = subscribeToTicketsData({
      user,
      onUpdate: (data) => {
        setTickets(data.tickets || []);
        setIsLoading(data.isLoading);
        setError(data.error);
      },
      onError: (err) => {
        setError(err.message || 'Failed to load tickets.');
        setIsLoading(false);
      }
    });

    const unsubFields = subscribeToFieldsData({
      user,
      onUpdate: (data) => {
        setFields(data.fields || []);
      }
    });

    return () => {
      if (typeof unsubTickets === 'function') unsubTickets();
      if (typeof unsubFields === 'function') unsubFields();
    };
  }, [user]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-primary dark:text-primary-light uppercase tracking-wider">
              Operational Assistance
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary-bg dark:bg-primary/20 text-primary dark:text-primary-light">
              Support Desk
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-hug-text tracking-tight mt-1">
            Support Desk
          </h1>
          <p className="text-xs sm:text-sm text-hug-muted mt-1 max-w-2xl">
            Report and track system issues, parcel data discrepancies, and technical inquiries.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="primary"
            size="md"
            onClick={() => setIsCreateOpen(true)}
            icon={PlusCircle}
          >
            Create Ticket
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-danger-bg/40 border border-danger/30 rounded-2xl flex items-start gap-3 text-xs sm:text-sm font-semibold text-danger">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Error loading support records</p>
            <p className="text-xs text-danger/80 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Ticket List */}
      <TicketList
        tickets={tickets}
        isLoading={isLoading}
        isSuperAdmin={isSuperAdmin}
        onResolveClick={(t) => setTicketToResolve(t)}
      />

      {/* Create Ticket Modal */}
      <CreateTicketModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        fields={fields}
        onCreated={() => {
          // Auto-updated via snapshot listener
        }}
      />

      {/* Resolve Ticket Modal (Super Admin only) */}
      {isSuperAdmin && (
        <ResolveTicketModal
          isOpen={Boolean(ticketToResolve)}
          onClose={() => setTicketToResolve(null)}
          ticket={ticketToResolve}
          onUpdated={() => {
            // Auto-updated via snapshot listener
          }}
        />
      )}
    </div>
  );
}
