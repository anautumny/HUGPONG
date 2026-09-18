import React, { useState, useMemo } from 'react';
import { Search, LifeBuoy, AlertCircle, CheckCircle2, Clock, ChevronDown, ChevronUp, User, MapPin, Tag, Wrench } from 'lucide-react';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Button from '../ui/Button';

export default function TicketList({
  tickets = [],
  isLoading = false,
  isSuperAdmin = false,
  onResolveClick,
  className = ''
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [expandedTicketId, setExpandedTicketId] = useState(null);

  const filteredTickets = useMemo(() => {
    let result = [...tickets];

    if (statusFilter !== 'ALL') {
      result = result.filter(t => t.status === statusFilter);
    }

    if (priorityFilter !== 'ALL') {
      result = result.filter(t => t.priority === priorityFilter);
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(t =>
        (t.id && t.id.toLowerCase().includes(q)) ||
        (t.title && t.title.toLowerCase().includes(q)) ||
        (t.category && t.category.toLowerCase().includes(q)) ||
        (t.createdByUserId && t.createdByUserId.toLowerCase().includes(q)) ||
        (t.details && t.details.toLowerCase().includes(q))
      );
    }

    return result;
  }, [tickets, statusFilter, priorityFilter, searchTerm]);

  const statusOptions = [
    { value: 'ALL', label: 'All Statuses' },
    { value: 'OPEN', label: 'Open' },
    { value: 'IN_PROGRESS', label: 'In Progress' },
    { value: 'RESOLVED', label: 'Resolved' },
    { value: 'CLOSED', label: 'Closed' }
  ];

  const priorityOptions = [
    { value: 'ALL', label: 'All Priorities' },
    { value: 'LOW', label: 'Low Priority' },
    { value: 'NORMAL', label: 'Normal Priority' },
    { value: 'HIGH', label: 'High Priority' },
    { value: 'URGENT', label: 'Urgent Priority' }
  ];

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'OPEN':
        return 'bg-danger-bg text-danger border-danger/20';
      case 'IN_PROGRESS':
        return 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200 dark:border-amber-800/60';
      case 'RESOLVED':
        return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60';
      case 'CLOSED':
        return 'bg-bg text-hug-muted dark:bg-gray-800 border-border';
      default:
        return 'bg-bg text-hug-muted border-border';
    }
  };

  const getPriorityBadgeClass = (priority) => {
    switch (priority) {
      case 'URGENT':
        return 'bg-danger text-white';
      case 'HIGH':
        return 'bg-danger-bg text-danger border border-danger/20';
      case 'NORMAL':
        return 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60';
      default:
        return 'bg-bg text-hug-muted border border-border';
    }
  };

  const formatDate = (isoString) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString.includes('T') ? isoString : `${isoString}T00:00:00Z`);
      return isNaN(d.getTime()) ? isoString : d.toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className={`bg-white dark:bg-surface rounded-2xl border border-border shadow-xs overflow-hidden ${className}`}>
      {/* Header & Filter Controls */}
      <div className="p-4 sm:p-5 border-b border-border/80 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-hug-text flex items-center gap-2">
            <span>Support Incident Queue</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-bg dark:bg-gray-800 text-hug-muted border border-border">
              {filteredTickets.length} tickets
            </span>
          </h3>
          <p className="text-xs text-hug-muted mt-0.5">
            Operational inquiries, data corrections, and technical incident reports.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
          <div className="w-full sm:w-52">
            <Input
              type="text"
              placeholder="Search tickets, IDs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              icon={Search}
            />
          </div>

          <div className="w-full sm:w-36">
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={statusOptions}
            />
          </div>

          <div className="w-full sm:w-36">
            <Select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              options={priorityOptions}
            />
          </div>
        </div>
      </div>

      {/* Ticket Rows */}
      <div className="divide-y divide-border/50">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="p-4 sm:p-5 animate-pulse space-y-2">
              <div className="h-4 w-48 bg-gray-200 dark:bg-gray-800 rounded" />
              <div className="h-3 w-64 bg-gray-200 dark:bg-gray-800 rounded" />
            </div>
          ))
        ) : filteredTickets.length === 0 ? (
          <div className="p-10 text-center text-xs text-hug-muted">
            <LifeBuoy className="w-8 h-8 mx-auto text-hug-muted/50 mb-2" />
            <p className="font-semibold text-hug-text text-sm">No support tickets found</p>
            <p className="text-xs text-hug-muted mt-0.5">
              {searchTerm ? 'No tickets matched your filter criteria.' : 'Create a new ticket if you encounter operational issues.'}
            </p>
          </div>
        ) : (
          filteredTickets.map((t) => {
            const isExpanded = expandedTicketId === t.id;

            return (
              <div key={t.id} className="p-4 sm:p-5 hover:bg-bg/20 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="font-mono text-xs font-bold text-primary dark:text-primary-light bg-primary-bg/50 px-2 py-0.5 rounded border border-primary/20 shrink-0 mt-0.5">
                      {t.id}
                    </span>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h4 className="text-sm font-bold text-hug-text truncate">
                          {t.title}
                        </h4>

                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getStatusBadgeClass(t.status)}`}>
                          {t.status}
                        </span>

                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${getPriorityBadgeClass(t.priority)}`}>
                          {t.priority}
                        </span>

                        <span className="text-[10px] font-medium text-hug-muted px-2 py-0.5 rounded-full bg-bg dark:bg-gray-800 border border-border">
                          {t.category}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-hug-muted flex-wrap">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {t.createdByUserId}
                        </span>
                        {t.fieldId && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-1 font-mono">
                              <MapPin className="w-3 h-3" />
                              {t.fieldId}
                            </span>
                          </>
                        )}
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDate(t.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                    {isSuperAdmin && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onResolveClick(t)}
                        icon={Wrench}
                      >
                        Manage Ticket
                      </Button>
                    )}

                    <button
                      type="button"
                      onClick={() => setExpandedTicketId(isExpanded ? null : t.id)}
                      className="p-1.5 text-hug-muted hover:text-hug-text rounded-lg transition-colors cursor-pointer"
                      title={isExpanded ? 'Collapse' : 'View details'}
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Expanded Details Section */}
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-border/60 text-xs space-y-2">
                    {t.details && (
                      <div className="bg-bg/60 dark:bg-gray-800/40 p-3 rounded-xl border border-border">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-hug-muted block mb-1">
                          Incident Details
                        </span>
                        <p className="text-hug-text whitespace-pre-wrap">{t.details}</p>
                      </div>
                    )}

                    {t.resolutionNotes && (
                      <div className="bg-emerald-50/60 dark:bg-emerald-950/20 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800/50">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 block mb-1">
                          Official Resolution Notes {t.resolvedAt && `(${formatDate(t.resolvedAt)})`}
                        </span>
                        <p className="text-hug-text whitespace-pre-wrap">{t.resolutionNotes}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
