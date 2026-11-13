import React, { useEffect, useState, useRef } from 'react';
import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { subscribeToAuthenticatedResource, authenticatedRequest } from '../../services/apiClient';
import { fetchNotificationState, updateNotificationState } from '../../services/notificationService';

export default function NotificationBell() {
  const { user } = useAuth();
  const userId = user?.employeeId || user?.id || '';
  const currentOwner = useRef(userId);
  currentOwner.current = userId;
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [read, setRead] = useState(new Set());
  const [error, setError] = useState('');
  const [cursor, setCursor] = useState(null);
  const navigate = useNavigate();
  useEffect(() => {
    let active = true, generation = 0;
    setItems([]); setRead(new Set()); setOpen(false);
    if (!userId) return;
    const stop = subscribeToAuthenticatedResource('/api/notifications/inbox?limit=50', {
      onData: async result => {
        if (!active) return;
        const request = ++generation;
        setItems(result.data || []); setCursor(result.page?.nextCursor || null); setError('');
        try {
          const state = await fetchNotificationState(userId, (result.data || []).map(item => item.id));
          if (active && request === generation) {
            setRead(new Set(state.data.filter(item => item.read || item.dismissed).map(item => item.id)));
            const dismissed = new Set(state.data.filter(item => item.dismissed).map(item => item.id));
            setItems(current => current.filter(item => !dismissed.has(item.id)));
          }
        } catch (error) { if (active) setError(error.message); }
      },
      onError: error => { if (active) setError(error.message); }
    });
    return () => { active = false; stop(); };
  }, [userId]);
  const select = async item => {
    const owner = userId;
    try {
      await updateNotificationState(userId, [item.id], 'read');
      if (currentOwner.current !== owner) return;
      setRead(current => new Set([...current, item.id])); setOpen(false);
      navigate(item.type === 'price' ? '/prices' : '/users');
    } catch (error) { setError(error.message); }
  };
  const older = async () => {
    const owner = userId;
    try {
      const result = await authenticatedRequest(`/api/notifications/inbox?limit=50&cursor=${encodeURIComponent(cursor)}`);
      if (currentOwner.current !== owner) return;
      setItems(current => [...new Map([...current, ...result.data].map(item => [item.id, item])).values()]);
      setCursor(result.page?.nextCursor || null);
    } catch (error) { setError(error.message); }
  };
  const unread = items.filter(item => !read.has(item.id)).length;
  return <div className="relative">
    <button type="button" className="relative p-2 rounded-xl border border-border bg-surface" aria-label={`Notifications, ${unread} unread`} aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <Bell className="w-4 h-4" />{unread > 0 && <span className="absolute -top-1 -right-1 text-[10px] bg-primary text-white rounded-full px-1">{unread}</span>}
    </button>
    {open && <div className="absolute right-0 top-full mt-2 w-80 max-w-[85vw] max-h-96 overflow-y-auto rounded-xl border border-border bg-surface shadow-xl p-3 z-50" aria-label="Notifications">
      <p className="font-bold text-sm mb-2">Notifications</p>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      {!items.length && !error && <p className="text-xs text-hug-muted">No notifications.</p>}
      {items.map(item => <button key={item.id} type="button" onClick={() => select(item)} className={`text-left w-full p-2 rounded-lg hover:bg-surface-subtle border-b border-border ${read.has(item.id) ? 'opacity-70' : ''}`}>
        <p className="font-semibold text-xs">{item.title}</p><p className="text-xs text-hug-muted mt-1">{item.body}</p>
      </button>)}
      {cursor && <button type="button" onClick={older} className="text-xs text-primary p-2">Load older notifications</button>}
    </div>}
  </div>;
}
