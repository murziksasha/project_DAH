import {
  FINANCE_WRITE_ROLES,
  Permission,
  hasPermission,
} from '@dah/shared';
import { getInstructionsHref, INSTRUCTIONS_NAV_LABEL } from './instructions-content';

export interface NavItem {
  href: string;
  label: string;
  /** Thematic icon id for NavIcon */
  icon?: string;
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
  return { href: getInstructionsHref(role), label: INSTRUCTIONS_NAV_LABEL, icon: 'book-open' };
}

/** Flat list (legacy helpers / simple menus). */
export function getNavItems(role: string, isInitialized = true): NavItem[] {
  return getNavGroups(role, isInitialized).flatMap((g) => g.items);
}

/** Grouped navigation for drawer / sidebar, filtered by RBAC. */
export function getNavGroups(role: string, isInitialized = true): NavGroup[] {
  if (role === 'super_admin') {
    const items: NavItem[] = [
      { href: '/admin/setup', label: 'Майстер налаштування', icon: 'wizard' },
      { href: '/admin/tenants', label: 'Організації', icon: 'building' },
      { href: '/admin/organization', label: 'Організація', icon: 'org' },
      instructionsItem(role),
    ];
    return [{ id: 'setup', label: 'Система', items }];
  }

  if (role === 'resident') {
    // Home (/resident) is «Домівка» in AppShell — not duplicated as «Мій рахунок».
    return [
      {
        id: 'resident',
        label: 'Кабінет',
        items: [
          { href: '/resident/meters', label: 'Лічильники', icon: 'gauge' },
          { href: '/resident/security', label: 'Безпека', icon: 'shield' },
          instructionsItem(role),
        ],
      },
    ];
  }

  if (!['chairman', 'accountant', 'board', 'auditor'].includes(role)) {
    return [];
  }

  const groups: NavGroup[] = [];

  // Home (/admin) is rendered once as «Домівка» in AppShell — do not duplicate as «Дашборд».
  const overview: NavItem[] = [
    { href: '/admin/search', label: 'Пошук квартири', icon: 'search' },
  ];
  if (hasPermission(role, Permission.READ_FINANCE)) {
    overview.push({ href: '/admin/reports', label: 'Звіти', icon: 'chart' });
  }
  groups.push({ id: 'overview', label: 'Огляд', items: overview });

  if (hasPermission(role, Permission.READ_FINANCE)) {
    const finance: NavItem[] = [];
    if (canWriteFinance(role)) {
      finance.push(
        { href: '/admin/expenses', label: 'Нова витрата', icon: 'wallet' },
        { href: '/admin/expenses/list', label: 'Список витрат', icon: 'list' },
        { href: '/admin/funds', label: 'Фонди', icon: 'bank' },
        { href: '/admin/suppliers', label: 'Довідники', icon: 'book' },
        { href: '/admin/accruals', label: 'Нарахування', icon: 'calc' },
        { href: '/admin/accruals/list', label: 'Історія нарахувань', icon: 'history' },
        { href: '/admin/payments', label: 'Платежі', icon: 'card' },
        { href: '/admin/meters', label: 'Лічильники', icon: 'gauge' },
      );
    } else {
      finance.push(
        { href: '/admin/expenses/list', label: 'Витрати', icon: 'list' },
        { href: '/admin/accruals/list', label: 'Нарахування', icon: 'history' },
      );
    }
    if (finance.length) {
      groups.push({ id: 'finance', label: 'Фінанси', items: finance });
    }
  }

  const building: NavItem[] = [
    { href: '/admin/documents', label: 'Документи', icon: 'file' },
  ];
  if (role === 'chairman' || role === 'board') {
    building.push({ href: '/admin/residents', label: 'Мешканці', icon: 'users' });
  }
  if (hasPermission(role, Permission.MANAGE_SETTINGS)) {
    building.push({ href: '/admin/settings', label: 'Налаштування', icon: 'gear' });
  }
  if (
    hasPermission(role, Permission.MANAGE_SETTINGS) ||
    canWriteFinance(role) ||
    role === 'board'
  ) {
    building.push({
      href: '/admin/document-templates',
      label: 'Конструктор документів',
      icon: 'file',
    });
  }
  groups.push({ id: 'building', label: 'Будинок', items: building });

  groups.push({
    id: 'comms',
    label: 'Комунікації',
    items: [{ href: '/admin/communications', label: 'Оголошення та заявки', icon: 'megaphone' }],
  });

  if (canWriteFinance(role) || role === 'auditor' || role === 'chairman') {
    groups.push({
      id: 'ops',
      label: 'Операції',
      items: [
        ...(canWriteFinance(role) ? [{ href: '/admin/reminders', label: 'Нагадування', icon: 'bell' }] : []),
        ...(role === 'chairman' ||
        role === 'board' ||
        role === 'accountant' ||
        role === 'super_admin'
          ? [{ href: '/admin/ops', label: 'Здоровʼя системи', icon: 'heart' }]
          : []),
        { href: '/admin/security', label: 'Безпека / 2FA', icon: 'shield' },
      ],
    });
  }

  const control: NavItem[] = [];
  if (role === 'chairman' || role === 'auditor') {
    control.push({ href: '/admin/audit', label: 'Аудит', icon: 'clipboard' });
  }
  control.push(instructionsItem(role));
  groups.push({ id: 'control', label: 'Контроль', items: control });

  // Super-admin setup path already returned; isInitialized unused for board roles
  void isInitialized;

  return groups.filter((g) => g.items.length > 0);
}

export function getShellTitle(role: string, orgType?: string | null): string {
  if (role === 'super_admin') return 'Система · Мій дім';
  if (role === 'resident') return 'Кабінет мешканця';
  if (['chairman', 'accountant', 'board', 'auditor'].includes(role)) {
    return orgType === 'management_company' ? 'Кабінет УК' : 'Кабінет правління';
  }
  return 'Мій дім';
}

export function getQuickActions(role: string): NavItem[] {
  if (!canWriteFinance(role)) {
    if (hasPermission(role, Permission.READ_FINANCE)) {
      return [{ href: '/admin/reports', label: 'Звіти / боржники', icon: 'chart' }];
    }
    return [];
  }
  return [
    { href: '/admin/payments', label: 'Зафіксувати платіж', icon: 'card' },
    { href: '/admin/expenses', label: 'Нова витрата', icon: 'wallet' },
    { href: '/admin/accruals', label: 'Нарахування', icon: 'calc' },
    { href: '/admin/search', label: 'Особовий рахунок', icon: 'search' },
    { href: '/admin/reports', label: 'Боржники', icon: 'chart' },
  ];
}
