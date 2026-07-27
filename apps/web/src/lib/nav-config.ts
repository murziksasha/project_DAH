import {
  FINANCE_WRITE_ROLES,
  Permission,
  hasPermission,
} from '@dah/shared';
import { getInstructionsHref, INSTRUCTIONS_NAV_LABEL } from './instructions-content';

export interface NavItem {
  href: string;
  label: string;
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

const FINANCE_WRITE = new Set<string>(FINANCE_WRITE_ROLES);

function canWriteFinance(role: string) {
  return FINANCE_WRITE.has(role);
}

function instructionsItem(role: string): NavItem {
  return { href: getInstructionsHref(role), label: INSTRUCTIONS_NAV_LABEL };
}

/** Flat list (legacy helpers / simple menus). */
export function getNavItems(role: string, isInitialized = true): NavItem[] {
  return getNavGroups(role, isInitialized).flatMap((g) => g.items);
}

/** Grouped navigation for drawer / sidebar, filtered by RBAC. */
export function getNavGroups(role: string, isInitialized = true): NavGroup[] {
  if (role === 'super_admin') {
    const items: NavItem[] = [
      { href: '/admin/setup', label: 'Майстер налаштування' },
      { href: '/admin/tenants', label: 'ОСББ (tenants)' },
      { href: '/admin/organization', label: 'Організація' },
      instructionsItem(role),
    ];
    return [{ id: 'setup', label: 'Система', items }];
  }

  if (role === 'resident') {
    return [
      {
        id: 'resident',
        label: 'Кабінет',
        items: [
          { href: '/resident', label: 'Мій рахунок' },
          { href: '/resident/meters', label: 'Лічильники' },
          { href: '/resident/security', label: 'Безпека' },
          instructionsItem(role),
        ],
      },
    ];
  }

  if (!['chairman', 'accountant', 'board', 'auditor'].includes(role)) {
    return [];
  }

  const groups: NavGroup[] = [];

  const overview: NavItem[] = [
    { href: '/admin', label: 'Дашборд' },
    { href: '/admin/search', label: 'Пошук квартири' },
  ];
  if (hasPermission(role, Permission.READ_FINANCE)) {
    overview.push({ href: '/admin/reports', label: 'Звіти' });
  }
  groups.push({ id: 'overview', label: 'Огляд', items: overview });

  if (hasPermission(role, Permission.READ_FINANCE)) {
    const finance: NavItem[] = [];
    if (canWriteFinance(role)) {
      finance.push(
        { href: '/admin/expenses', label: 'Нова витрата' },
        { href: '/admin/expenses/list', label: 'Список витрат' },
        { href: '/admin/funds', label: 'Фонди' },
        { href: '/admin/suppliers', label: 'Довідники' },
        { href: '/admin/accruals', label: 'Нарахування' },
        { href: '/admin/accruals/list', label: 'Історія нарахувань' },
        { href: '/admin/payments', label: 'Платежі' },
        { href: '/admin/meters', label: 'Лічильники' },
      );
    } else {
      finance.push(
        { href: '/admin/expenses/list', label: 'Витрати' },
        { href: '/admin/accruals/list', label: 'Нарахування' },
      );
    }
    if (finance.length) {
      groups.push({ id: 'finance', label: 'Фінанси', items: finance });
    }
  }

  const building: NavItem[] = [
    { href: '/admin/documents', label: 'Документи' },
  ];
  if (role === 'chairman' || role === 'board') {
    building.push({ href: '/admin/residents', label: 'Мешканці' });
  }
  if (hasPermission(role, Permission.MANAGE_SETTINGS)) {
    building.push({ href: '/admin/settings', label: 'Налаштування' });
  }
  groups.push({ id: 'building', label: 'Будинок', items: building });

  groups.push({
    id: 'comms',
    label: 'Комунікації',
    items: [{ href: '/admin/communications', label: 'Оголошення та заявки' }],
  });

  if (canWriteFinance(role) || role === 'auditor' || role === 'chairman') {
    groups.push({
      id: 'ops',
      label: 'Операції',
      items: [
        ...(canWriteFinance(role) ? [{ href: '/admin/reminders', label: 'Нагадування' }] : []),
        ...(role === 'chairman' || role === 'board' || role === 'super_admin'
          ? [{ href: '/admin/ops', label: 'Здоровʼя системи' }]
          : []),
        { href: '/admin/security', label: 'Безпека / 2FA' },
      ],
    });
  }

  const control: NavItem[] = [];
  if (role === 'chairman' || role === 'auditor') {
    control.push({ href: '/admin/audit', label: 'Аудит' });
  }
  control.push(instructionsItem(role));
  groups.push({ id: 'control', label: 'Контроль', items: control });

  // Super-admin setup path already returned; isInitialized unused for board roles
  void isInitialized;

  return groups.filter((g) => g.items.length > 0);
}

export function getShellTitle(role: string): string {
  if (role === 'super_admin') return 'Налаштування ОСМД';
  if (role === 'resident') return 'Кабінет мешканця';
  if (['chairman', 'accountant', 'board', 'auditor'].includes(role)) return 'Кабінет правління';
  return 'DAH';
}

export function getQuickActions(role: string): NavItem[] {
  if (!canWriteFinance(role)) {
    if (hasPermission(role, Permission.READ_FINANCE)) {
      return [{ href: '/admin/reports', label: 'Звіти / боржники' }];
    }
    return [];
  }
  return [
    { href: '/admin/payments', label: 'Зафіксувати платіж' },
    { href: '/admin/expenses', label: 'Нова витрата' },
    { href: '/admin/accruals', label: 'Нарахування' },
    { href: '/admin/search', label: 'Особовий рахунок' },
    { href: '/admin/reports', label: 'Боржники' },
  ];
}
