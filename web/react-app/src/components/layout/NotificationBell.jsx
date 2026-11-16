import React, { useEffect, useState, useRef } from 'react';
import { Bell, CheckCheck, Loader2, Trash2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { subscribeToAuthenticatedLoader, authenticatedRead, authenticatedRequest } from '../../services/apiClient';
import { fetchNotificationState, updateNotificationState, updateAllNotificationState } from '../../services/notificationService';

export default function NotificationBell() {
  const { user } = useAuth();
  const userId = user?.employeeId || user?.id || '';
  const currentOwner = useRef(userId);
  currentOwner.current = userId;
  const lifecycle = useRef(0);
  const working = useRef('');
  const dismissed = useRef(new Set());
  const inboxOwner = useRef('');
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [read, setRead] = useState(new Set());
  const [error, setError] = useState('');
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const navigate = useNavigate();

  const applyState = rows => {
    const readIds = rows.filter(row => row.read || row.dismissed).map(row => row.id);
    rows.filter(row => row.dismissed).forEach(row => dismissed.current.add(row.id));
    setRead(current => new Set([...current, ...readIds]));
    setItems(current => current.filter(item => !dismissed.current.has(item.id)));
  };

  useEffect(() => {
    const version = ++lifecycle.current;
    let active = true;
    working.current = ''; dismissed.current = new Set();
    inboxOwner.current = '';
    setItems([]); setRead(new Set()); setOpen(false); setCursor(null); setError(''); setBusy(''); setLoading(Boolean(userId));
    if (!userId) return () => { lifecycle.current++; };
    const stop = subscribeToAuthenticatedLoader(async ({ force }) => {
      const result = await authenticatedRead('/api/notifications/inbox?limit=50', { force });
      const state = await fetchNotificationState(userId, (result.data || []).map(item => item.id));
      if (!Array.isArray(state.data)) throw new Error('Notification state could not be loaded. Please retry.');
      return { ...result, notificationState: state.data };
    }, {
      resources: ['notifications'],
      onData: result => {
        if (!active || lifecycle.current !== version) return;
        inboxOwner.current = userId;
        applyState(result.notificationState || []);
        setItems((result.data || []).filter(item => !dismissed.current.has(item.id)));
        setCursor(result.page?.nextCursor || null); setError(''); setLoading(false);
      },
      onError: failure => {
        if (active && lifecycle.current === version) { setError(failure.message); setLoading(false); }
      }
    });
    return () => { active = false; lifecycle.current++; stop(); };
  }, [userId]);

  const run = async (name, work) => {
    if (working.current || !userId) return;
    const owner = userId, version = lifecycle.current;
    const current = () => currentOwner.current === owner && lifecycle.current === version;
    working.current = name; setBusy(name); setError('');
    try { await work(current); }
    catch (failure) { if (current() && failure.code !== 'AUTH_CONTEXT_CHANGED') setError(failure.message || 'Notifications could not be updated. Please retry.'); }
    finally { if (current()) { working.current = ''; setBusy(''); } }
  };

  const mark = (item, action, shouldOpen = false) => run(`${action}:${item.id}`, async current => {
    const result = await updateNotificationState(userId, [item.id], action);
    if (!current()) return;
    if (!Array.isArray(result.data) || !result.data.some(row => row.id === item.id && row.read && (action !== 'dismiss' || row.dismissed))) throw new Error('Notification update was not confirmed. Please retry.');
    applyState(result.data);
    if (shouldOpen) { setOpen(false); navigate(item.type === 'price' ? '/prices' : '/users'); }
  });

  const bulk = action => {
    if (working.current) return;
    if (action === 'dismiss' && !window.confirm('Clear all notifications? This clears your notification list and keeps the underlying records.')) return;
    return run(`${action}:all`, async current => {
      const result = await updateAllNotificationState(userId, action, { isCurrent: current });
      if (current()) { applyState(result.data); if (action === 'dismiss') setCursor(null); }
    });
  };

  const older = () => run('older', async current => {
    if (!cursor) return;
    const result = await authenticatedRequest(`/api/notifications/inbox?limit=50&cursor=${encodeURIComponent(cursor)}`);
    if (!current()) return;
    const state = await fetchNotificationState(userId, (result.data || []).map(item => item.id));
    if (!current()) return;
    if (!Array.isArray(state.data)) throw new Error('Notification state could not be loaded. Please retry.');
    applyState(state.data || []);
    setItems(previous => [...new Map([...previous, ...(result.data || [])].filter(item => !dismissed.current.has(item.id)).map(item => [item.id, item])).values()]);
    setCursor(result.page?.nextCursor || null);
  });

  const visibleItems = inboxOwner.current === userId ? items : [];
  const unread = visibleItems.filter(item => !read.has(item.id)).length;
  if (!userId) return null;
  const actionClass = 'inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border border-border px-2 py-1.5 text-xs font-semibold hover:bg-bg disabled:opacity-50 disabled:cursor-not-allowed';
  return <div className="relative">
    <button type="button" className="relative p-2 rounded-xl border border-border bg-surface" aria-label={`Notifications, ${unread} unread`} aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <Bell className="w-4 h-4" />{unread > 0 && <span className="absolute -top-1 -right-1 text-[10px] bg-primary text-white rounded-full px-1">{unread}</span>}
    </button>
    {open && <div className="absolute right-0 top-full mt-2 w-96 max-w-[85vw] max-h-[70vh] overflow-y-auto rounded-xl border border-border bg-surface shadow-xl p-3 z-50" aria-label="Notifications" aria-busy={loading || Boolean(busy)}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <p className="font-bold text-sm">Notifications {unread > 0 && <span className="text-xs text-hug-muted">({unread} unread)</span>}</p>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close notifications" className="p-1 rounded-lg hover:bg-bg"><X className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <button type="button" className={actionClass} disabled={loading || Boolean(busy) || (!unread && !cursor)} onClick={() => bulk('read')}>
          {busy === 'read:all' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}Mark all as read
        </button>
        <button type="button" className={`${actionClass} text-danger`} disabled={loading || Boolean(busy) || (!visibleItems.length && !cursor)} onClick={() => bulk('dismiss')}>
          {busy === 'dismiss:all' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}Clear all
        </button>
      </div>
      {error && <p role="alert" className="text-xs text-danger mb-2">{error}</p>}
      {loading && <p role="status" className="text-xs text-hug-muted flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading notifications...</p>}
      {!visibleItems.length && !loading && !error && <p className="text-xs text-hug-muted">No notifications.</p>}
      {visibleItems.map(item => <div key={item.id} className={`rounded-lg border-b border-border py-2 ${read.has(item.id) ? 'opacity-70' : ''}`}>
        <button type="button" disabled={Boolean(busy)} onClick={() => mark(item, 'read', true)} className="text-left w-full p-2 rounded-lg hover:bg-bg disabled:cursor-wait">
          <p className="font-semibold text-xs">{item.title}</p><p className="text-xs text-hug-muted mt-1">{item.body}</p>
        </button>
        <div className="flex items-center justify-end gap-2 px-2 pt-1">
          {read.has(item.id) ? <span className="text-xs text-hug-muted mr-auto">Read</span> : <button type="button" className={actionClass} disabled={Boolean(busy)} onClick={() => mark(item, 'read')} aria-label={`Mark as read: ${item.title}`}>
            {busy === `read:${item.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCheck className="h-3 w-3" />}Mark read
          </button>}
          <button type="button" className={`${actionClass} text-hug-muted`} disabled={Boolean(busy)} onClick={() => mark(item, 'dismiss')} aria-label={`Clear notification: ${item.title}`}>
            {busy === `dismiss:${item.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}Clear
          </button>
        </div>
      </div>)}
      {cursor && <button type="button" onClick={older} disabled={Boolean(busy)} className="text-xs text-primary p-2 disabled:opacity-50">{busy === 'older' ? 'Loading older notifications...' : 'Load older notifications'}</button>}
    </div>}
  </div>;
}
