import { useEffect, useState } from 'react';
import { getReplica, subscribeToReplica } from '../services/platformAdapter';
import { startReplica } from '../services/replicaStore';

export function useReplica(session) {
  const [replica, setReplica] = useState(() => getReplica());
  useEffect(() => {
    const unsubscribe = subscribeToReplica(setReplica);
    const stop = startReplica(session);
    setReplica(getReplica());
    return () => { unsubscribe(); stop(); };
  }, [session?.user?.employeeId, session?.roleKey]);
  return replica;
}
