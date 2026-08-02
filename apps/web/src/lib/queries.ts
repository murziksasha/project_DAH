import { useQuery } from '@tanstack/react-query';
import { apiFetch, getToken } from './api';
import { getSelectedBuildingId } from './building-context';

export const queryKeys = {
  health: ['health'] as const,
  funds: (buildingId: string | null) => ['funds', buildingId] as const,
  apartments: (buildingId: string | null) => ['apartments', buildingId] as const,
  payments: (buildingId: string | null, qs: string) => ['payments', buildingId, qs] as const,
  debtors: (buildingId: string | null) => ['debtors', buildingId] as const,
  opsSummary: (buildingId: string | null) => ['ops-summary', buildingId] as const,
  cashFlow: (buildingId: string | null, qs: string) => ['cash-flow', buildingId, qs] as const,
};

function authToken() {
  const t = getToken();
  if (!t) throw new Error('Немає сесії');
  return t;
}

export function useFundsQuery(enabled = true) {
  const buildingId = getSelectedBuildingId();
  return useQuery({
    queryKey: queryKeys.funds(buildingId),
    enabled,
    queryFn: () =>
      apiFetch<Array<{ id: string; name: string; type: string; openingBalance: string | number }>>(
        '/finance/funds',
        { token: authToken() },
      ),
  });
}

export type ApartmentListItem = {
  id: string;
  number: string;
  entrance: number;
  area: number;
  floor?: number | null;
  users?: Array<{
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    status: string;
    isPrimary?: boolean;
  }>;
  residents?: Array<{
    id?: string;
    firstName: string;
    lastName: string;
    isOwner?: boolean;
    phone?: string | null;
    email?: string | null;
  }>;
};

export function useApartmentsQuery(enabled = true) {
  const buildingId = getSelectedBuildingId();
  return useQuery({
    queryKey: queryKeys.apartments(buildingId),
    enabled,
    queryFn: () =>
      apiFetch<ApartmentListItem[]>('/building/apartments', { token: authToken() }),
  });
}

export function useDebtorsQuery(enabled = true) {
  const buildingId = getSelectedBuildingId();
  return useQuery({
    queryKey: queryKeys.debtors(buildingId),
    enabled,
    queryFn: () =>
      apiFetch<
        Array<{ apartmentId: string; number: string; debt: number; isOverdue: boolean }>
      >('/payments/reports/debtors', { token: authToken() }),
  });
}

export function useOpsSummaryQuery(enabled = true) {
  const buildingId = getSelectedBuildingId();
  return useQuery({
    queryKey: queryKeys.opsSummary(buildingId),
    enabled,
    queryFn: () =>
      apiFetch<{
        pendingResidents: number;
        openRequests: number;
        activePolls: number;
        openAccrualLines: number;
        documents: number;
      }>('/building/ops-summary', { token: authToken() }),
  });
}

export function useCashFlowQuery(from: string, to: string, enabled = true) {
  const buildingId = getSelectedBuildingId();
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  const q = qs.toString();
  return useQuery({
    queryKey: queryKeys.cashFlow(buildingId, q),
    enabled,
    queryFn: () =>
      apiFetch<{
        totalIncome: number;
        totalExpenses: number;
        netFlow: number;
        fundBalances: Array<{
          fundName: string;
          balance: number;
          income: number;
          expenses: number;
        }>;
      }>(`/finance/reports/cash-flow${q ? `?${q}` : ''}`, { token: authToken() }),
  });
}

export function useExpensesPageQuery(
  params: { from?: string; to?: string; fundId?: string; page?: number; limit?: number },
  enabled = true,
) {
  const buildingId = getSelectedBuildingId();
  const qs = new URLSearchParams();
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  if (params.fundId) qs.set('fundId', params.fundId);
  qs.set('page', String(params.page ?? 1));
  qs.set('limit', String(params.limit ?? 50));
  const q = qs.toString();
  return useQuery({
    queryKey: ['expenses', buildingId, q] as const,
    enabled,
    queryFn: () =>
      apiFetch<{
        items: Array<{
          id: string;
          amount: string | number;
          date: string;
          description: string | null;
          fund: { name: string };
          category: { name: string };
        }>;
        total: number;
        page: number;
        totalPages: number;
      }>(`/finance/expenses?${q}`, { token: authToken() }),
  });
}

export function useBankAccountsQuery(enabled = true) {
  const buildingId = getSelectedBuildingId();
  return useQuery({
    queryKey: ['bank-accounts', buildingId] as const,
    enabled,
    queryFn: () =>
      apiFetch<
        Array<{ id: string; bankName: string; iban: string; description?: string | null }>
      >('/finance/bank-accounts', { token: authToken() }),
  });
}
