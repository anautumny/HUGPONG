import React, { useEffect, useState } from 'react';
import { LifeBuoy, PlusCircle, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { addTicketMessage, fetchTicketPage, subscribeToTicketsData } from '../../services/ticketsService';
import { subscribeToFieldsData } from '../../services/fieldsService';
import { canCreateSupportTicket, isSupportAdministrator } from '../../domain/supportTickets';
import TicketList from '../../components/tickets/TicketList';
import CreateTicketModal from '../../components/tickets/CreateTicketModal';
import ResolveTicketModal from '../../components/tickets/ResolveTicketModal';
import Button from '../../components/ui/Button';

export default function TicketsView() {
  const { user } = useAuth();
  const role = user?.canonicalRole || user?.role || user?.roleKey;
  const isSuperAdmin = isSupportAdministrator(role);
  const canCreate = canCreateSupportTicket(role);
  const [view, setView] = useState('active');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [tickets, setTickets] = useState([]);
  const [fields, setFields] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [ticketToResolve, setTicketToResolve] = useState(null);
  const [activeCounts, setActiveCounts] = useState({ open: 0, inProgress: 0, pending: 0 });

  useEffect(() => {
    setIsLoading(true);
    setTickets([]);
    const unsubscribe = subscribeToTicketsData({
      user,
      view,
      category: categoryFilter === 'ALL' ? null : categoryFilter,
      onUpdate: data => {
        const nextTickets = data.tickets || [];
        setTickets(nextTickets);
        if (view === 'active') {
          setActiveCounts({
            open: nextTickets.filter(ticket => ticket.status === 'OPEN').length,
            inProgress: nextTickets.filter(ticket => ticket.status === 'IN_PROGRESS').length,
            pending: nextTickets.filter(ticket => ticket.status === 'PENDING_SUBMISSION').length
          });
        }
        setNextCursor(data.nextCursor || null);
        setHasMore(data.hasMore === true);
        setIsLoading(false);
        if (!data.tickets?.length && data.error) setError(data.error);
      },
      onError: err => {
        setError(err.message || 'Failed to load tickets.');
        setIsLoading(false);
      }
    });
    return () => unsubscribe?.();
  }, [user, view, categoryFilter]);

  useEffect(() => {
    if (!canCreate) return undefined;
    const unsubscribe = subscribeToFieldsData({ user, onUpdate: data => setFields(data.fields || []) });
    return () => unsubscribe?.();
  }, [user, canCreate]);

  const handleLoadMore = async () => {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const response = await fetchTicketPage({ view, cursor: nextCursor, limit: 20, user, category: categoryFilter === 'ALL' ? null : categoryFilter });
      const incoming = response.data || [];
      setTickets(current => [...current, ...incoming.filter(ticket => !current.some(item => item.id === ticket.id))]);
      setNextCursor(response.nextCursor || null);
      setHasMore(response.hasMore === true);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoadingMore(false);
    }
  };

  return (
    <div className="space-y-5 max-w-7xl mx-auto pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
            <LifeBuoy className="w-4 h-4" /> Support
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-hug-text tracking-tight mt-1">
            {isSuperAdmin ? 'Support Inbox' : 'Help & Support Desk'}
          </h1>
          <p className="text-xs sm:text-sm text-hug-muted mt-1">
            {isSuperAdmin ? 'Review, respond to, and resolve user support requests.' : 'Ask for help and check responses from Super Admin.'}
          </p>
        </div>
        {canCreate && (
          <Button variant="primary" size="md" onClick={() => setIsCreateOpen(true)} icon={PlusCircle}>
            Create Ticket
          </Button>
        )}
      </div>

      {isSuperAdmin && (
        <div className="grid grid-cols-2 gap-3 max-w-md">
          <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4"><div className="text-2xl font-black text-slate-900 dark:text-white">{activeCounts.open}</div><div className="text-xs text-slate-600 dark:text-slate-300">Open</div></div>
          <div className="rounded-2xl border border-primary/20 bg-primary-bg/40 dark:bg-primary/10 p-4"><div className="text-2xl font-black text-primary dark:text-primary-light">{activeCounts.inProgress}</div><div className="text-xs text-slate-600 dark:text-slate-300">In Progress</div></div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-b border-border/80 pb-2.5">
        <button type="button" onClick={() => setView('active')} className={`px-4.5 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${view === 'active' ? 'bg-primary text-white shadow-xs' : 'text-hug-muted hover:text-hug-text hover:bg-bg dark:hover:bg-gray-800'}`}>
          {isSuperAdmin ? 'Inbox' : 'Active'}
        </button>
        <button type="button" onClick={() => setView('history')} className={`px-4.5 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${view === 'history' ? 'bg-primary text-white shadow-xs' : 'text-hug-muted hover:text-hug-text hover:bg-bg dark:hover:bg-gray-800'}`}>
          Ticket History
        </button>
      </div>

      {notice && <div className="p-3 bg-success-bg border border-success/30 rounded-xl flex gap-2 text-sm text-success"><CheckCircle2 className="w-5 h-5" />{notice}</div>}
      {error && <div className="p-4 bg-danger-bg/40 border border-danger/30 rounded-2xl flex items-start gap-3 text-sm text-danger"><AlertCircle className="w-5 h-5" /><span>{error}</span></div>}

      <TicketList
        tickets={tickets}
        isLoading={isLoading}
        isSuperAdmin={isSuperAdmin}
        title={view === 'history' ? 'Ticket History' : (isSuperAdmin ? 'Support Inbox' : 'Active Tickets')}
        emptyMessage={view === 'history' ? 'No resolved or closed tickets yet.' : 'No active support tickets.'}
        onResolveClick={setTicketToResolve}
        onSendMessage={async (ticket, content) => {
          const response = await addTicketMessage(ticket.id, content);
          setTickets(current => current.map(item => item.id === ticket.id ? response.data : item));
          setNotice('Follow-up sent to support.');
        }}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={setCategoryFilter}
      />

      {hasMore && (
        <div className="text-center"><Button variant="outline" onClick={handleLoadMore} isLoading={isLoadingMore}>Load More</Button></div>
      )}

      {canCreate && (
        <CreateTicketModal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          fields={fields}
          user={user}
          onCreated={(createdTicket) => {
            setTickets(current => [createdTicket, ...current.filter(ticket => ticket.id !== createdTicket.id)]);
            setNotice('Ticket submitted successfully and is now Open.');
          }}
        />
      )}

      {isSuperAdmin && (
        <ResolveTicketModal
          isOpen={Boolean(ticketToResolve)}
          onClose={() => setTicketToResolve(null)}
          ticket={ticketToResolve}
          onUpdated={updatedTicket => {
            setTickets(current => ['RESOLVED', 'CLOSED'].includes(updatedTicket.status) && view === 'active'
              ? current.filter(ticket => ticket.id !== updatedTicket.id)
              : current.map(ticket => ticket.id === updatedTicket.id ? updatedTicket : ticket));
            setNotice(updatedTicket.status === 'RESOLVED' ? 'Ticket resolved and moved to Ticket History.' : 'Ticket updated.');
          }}
        />
      )}
    </div>
  );
}
