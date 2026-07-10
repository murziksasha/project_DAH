export const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Системний адмін',
  chairman: 'Голова',
  accountant: 'Бухгалтер',
  board: 'Правління',
  auditor: 'Ревізія',
  resident: 'Мешканець',
};

export const STATUS_LABELS: Record<string, string> = {
  active: 'Активний',
  pending: 'Очікує',
  blocked: 'Заблокований',
};

export const STATUS_COLORS: Record<string, string> = {
  active: 'var(--success)',
  pending: '#b8860b',
  blocked: 'var(--danger, #c0392b)',
};

export const CREATE_ROLES = ['chairman', 'accountant', 'auditor', 'board'] as const;

export const EDIT_ROLES = [...CREATE_ROLES, 'resident'] as const;

export const PAGE_SIZE = 20;