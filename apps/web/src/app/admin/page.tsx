'use client';

import { getStoredUser } from '@/lib/auth';
import { AccountantDashboard } from './_components/AccountantDashboard';
import { BoardDashboard } from './_components/BoardDashboard';
import { CrewDashboard } from './_components/CrewDashboard';
import { DispatcherDashboard } from './_components/DispatcherDashboard';

/**
 * Role-aware admin home:
 * - accountant → finance ops
 * - dispatcher → SLA queue summary
 * - crew → my jobs
 * - chairman/board/auditor → full board dashboard
 */
export default function AdminHomePage() {
  const user = getStoredUser();
  const role = user?.role ?? '';

  if (role === 'dispatcher') return <DispatcherDashboard />;
  if (role === 'crew') return <CrewDashboard />;
  if (role === 'accountant') return <AccountantDashboard />;
  return <BoardDashboard />;
}
