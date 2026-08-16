'use client';

import { getStoredUser } from '@/lib/auth';
import { AccountantDashboard } from './_components/AccountantDashboard';
import { BoardDashboard } from './_components/BoardDashboard';
import { CrewDashboard } from './_components/CrewDashboard';
import { DispatcherDashboard } from './_components/DispatcherDashboard';
import { PortfolioDashboard } from './_components/PortfolioDashboard';

/**
 * Role-aware admin home:
 * - accountant → finance ops
 * - dispatcher → SLA queue summary
 * - crew → my jobs
 * - chairman of УК (management_company) → portfolio multi-building
 * - chairman/board/auditor ОСББ → full board dashboard
 */
export default function AdminHomePage() {
  const user = getStoredUser() as {
    role?: string;
    tenant?: { orgType?: string } | null;
    memberships?: Array<{ tenant?: { orgType?: string } }>;
  } | null;
  const role = user?.role ?? '';
  const orgType =
    user?.tenant?.orgType ??
    user?.memberships?.find((m) => m.tenant?.orgType)?.tenant?.orgType ??
    'osbb';

  if (role === 'dispatcher') return <DispatcherDashboard />;
  if (role === 'crew') return <CrewDashboard />;
  if (role === 'accountant') return <AccountantDashboard />;
  if (
    (role === 'chairman' || role === 'board') &&
    orgType === 'management_company'
  ) {
    return <PortfolioDashboard />;
  }
  return <BoardDashboard />;
}
