import React, { Suspense } from 'react';
import { useLocation } from 'react-router-dom';
import RouteLoadingState from './RouteLoadingState';

export default function RouteContent({ children }) {
  const { pathname } = useLocation();
  // A new page needs a new loading boundary. Otherwise a router Transition
  // retains the previous page until the new lazy module finishes loading.
  // Keep this below the shell so navigation and its subscriptions stay mounted.
  return <Suspense key={pathname} fallback={<RouteLoadingState />}>{children}</Suspense>;
}
