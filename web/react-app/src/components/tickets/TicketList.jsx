import React, { useState, useMemo } from 'react';
import { Search, LifeBuoy, Clock, ChevronDown, ChevronUp, User, MapPin, Wrench, Send } from 'lucide-react';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Button from '../ui/Button';
import { TICKET_CATEGORIES } from '../../domain/supportTickets';

export default function TicketList({
  tickets = [],
  isLoading = false,
  isSuperAdmin = false,
  onResolveClick,
  onSendMessage,
  categoryFilter = 'ALL',
  onCategoryFilterChange,
  title = 'Support Inbox',
  emptyMessage = 'No support tickets require attention.',
  className = ''
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [expandedTicketId, setExpandedTicketId] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const filteredTickets = useMemo(() => {
    let result = [...tickets];

    if (statusFilter !== 'ALL') {
      result = result.filter(t => t.status === statusFilter);
    }

    if (priorityFilter !== 'ALL') {
      result = result.filter(t => t.priority === priorityFilter);
    }

    if (categoryFilter !== 'ALL') result = result.filter(t => t.category === categoryFilter);

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
  }, [tickets, statusFilter, priorityFilter, categoryFilter, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredTickets.length / pageSize));
  const validPage = Math.min(currentPage, totalPages);
  const pagedTickets = useMemo(() => {
    const start = (validPage - 1) * pageSize;
    return filteredTickets.slice(start, start + pageSize);
  }, [filteredTickets, validPage, pageSize]);

  const statusOptions = [
    { value: 'ALL', label: 'All Statuses' },
    { value: 'PENDING_SUBMISSION', label: 'Pending Submission' },
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
  const categoryOptions = [{ value: 'ALL', label: 'All Categories' }, ...TICKET_CATEGORIES.map(value => ({ value, label: value }))];

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'OPEN':
        return 'bg-bg text-hug-muted border-border';
      case 'IN_PROGRESS':
        return 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200 dark:border-amber-800/60';
      case 'RESOLVED':
        return 'bg-success-bg text-success border border-success/30';
      case 'CLOSED':
        return 'bg-bg text-hug-muted dark:bg-gray-800 border-border';
      case 'PENDING_SUBMISSION':
        return 'bg-amber-50 text-amber-700 border-amber-200';
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
            <span>{title}</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-bg dark:bg-gray-800 text-hug-muted border border-border">
              {filteredTickets.length} tickets
            </span>
          </h3>
          <p className="text-xs text-hug-muted mt-0.5">
            {isSuperAdmin ? 'Requests assigned to Super Admin support.' : 'Your private support requests and responses.'}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
          <div className="w-full sm:w-52">
            <Input
              type="text"
              placeholder="Search tickets..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              icon={Search}
            />
          </div>

          <div className="w-full sm:w-36">
            <Select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              options={statusOptions}
            />
          </div>

          <div className="w-full sm:w-40">
            <Select
              value={priorityFilter}
              onChange={(e) => {
                setPriorityFilter(e.target.value);
                setCurrentPage(1);
              }}
              options={priorityOptions}
            />
          </div>

          <div className="w-full sm:w-48">
            <Select
              value={categoryFilter}
              onChange={(e) => {
                onCategoryFilterChange?.(e.target.value);
                setCurrentPage(1);
              }}
              options={categoryOptions}
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
              {searchTerm ? 'No tickets matched your filter criteria.' : emptyMessage}
            </p>
          </div>
        ) : (
          pagedTickets.map((t) => {
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
                          {String(t.status || 'OPEN').replace(/_/g, ' ')}
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
                          {t.requesterName || t.memberName || t.createdByUserId}
                          {t.requesterRole ? ` · ${String(t.requesterRole).replace(/_/g, ' ')}` : ''}
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
                      <div className="bg-success-bg/60 p-3 rounded-xl border border-success/30">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-success block mb-1">
                          Official Resolution Notes {t.resolvedAt && `(${formatDate(t.resolvedAt)})`}
                        </span>
                        <p className="text-hug-text whitespace-pre-wrap">{t.resolutionNotes}</p>
                      </div>
                    )}

                    {Array.isArray(t.messages) && t.messages.length > 0 && (
                      <div className="space-y-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-hug-muted">Conversation</span>
                        {t.messages.map((message, index) => (
                          <div key={message.messageId || index} className="p-3 rounded-xl border border-border bg-white dark:bg-gray-900">
                            <div className="flex justify-between gap-3 text-[10px] text-hug-muted mb-1">
                              <strong className="text-hug-text">{message.authorName || message.authorUserId || 'HUGPONG User'}</strong>
                              <span>{formatDate(message.createdAt)}</span>
                            </div>
                            <p className="text-hug-text whitespace-pre-wrap">{message.content || message.text}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {!isSuperAdmin && ['OPEN', 'IN_PROGRESS'].includes(t.status) && onSendMessage && (
                      <div className="flex gap-2 items-end">
                        <div className="flex-1">
                          <Input
                            type="text"
                            placeholder="Add a follow-up message..."
                            value={expandedTicketId === t.id ? replyText : ''}
                            onChange={(event) => setReplyText(event.target.value)}
                            disabled={sendingReply}
                          />
                        </div>
                        <Button
                          variant="primary"
                          size="sm"
                          icon={Send}
                          disabled={!replyText.trim() || sendingReply}
                          isLoading={sendingReply}
                          onClick={async () => {
                            setSendingReply(true);
                            try {
                              await onSendMessage(t, replyText.trim());
                              setReplyText('');
                            } finally {
                              setSendingReply(false);
                            }
                          }}
                        >
                          Send
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Pagination Footer */}
      <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-t border-border/60 bg-bg/30 dark:bg-black/10 text-xs">
        <div className="text-hug-muted font-medium">
          <span>
            Showing page <strong className="text-hug-text">{validPage}</strong> of{' '}
            <strong className="text-hug-text">{totalPages}</strong>{' '}
            <span className="text-hug-muted">({filteredTickets.length} tickets)</span>
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={validPage === 1}
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            aria-label="Previous page"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-border
              text-hug-muted bg-surface hover:bg-bg hover:text-hug-text transition-colors
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Prev</span>
          </button>
          <button
            type="button"
            disabled={validPage === totalPages}
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            aria-label="Next page"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-border
              text-hug-muted bg-surface hover:bg-bg hover:text-hug-text transition-colors
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span>Next</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
