import { getInstructionsHref, INSTRUCTIONS_NAV_LABEL } from './instructions-content';

export interface NavItem {
  href: string;
  label: string;
}

function instructionsItem(role: string): NavItem {
  return { href: getInstructionsHref(role), label: INSTRUCTIONS_NAV_LABEL };
}

export function getNavItems(role: string, isInitialized = true): NavItem[] {
  if (role === 'super_admin') {
    const items: NavItem[] = [
      { href: '/admin/setup', label: 'Майстер налаштування' },
      { href: '/admin/organization', label: 'Організація' },
      instructionsItem(role),
    ];
    if (!isInitialized) {
      return items;
    }
    return items;
  }

  if (role === 'resident') {
    return [
      { href: '/resident', label: 'Кабінет мешканця' },
      instructionsItem(role),
    ];
  }

  if (['chairman', 'accountant', 'board', 'auditor'].includes(role)) {
    return [
      { href: '/admin', label: 'Дашборд' },
      { href: '/admin/expenses', label: 'Нова витрата' },
      { href: '/admin/expenses/list', label: 'Список витрат' },
      { href: '/admin/suppliers', label: 'Постачальники' },
      { href: '/admin/accruals', label: 'Нарахування' },
      { href: '/admin/payments', label: 'Платежі' },
      { href: '/admin/reports', label: 'Звіти' },
      { href: '/admin/documents', label: 'Документи' },
      { href: '/admin/communications', label: 'Комунікації' },
      { href: '/admin/residents', label: 'Мешканці' },
      { href: '/admin/settings', label: 'Налаштування' },
      { href: '/admin/audit', label: 'Аудит' },
      instructionsItem(role),
    ];
  }

  return [];
}

export function getShellTitle(role: string): string {
  if (role === 'super_admin') return 'Налаштування ОСМД';
  if (role === 'resident') return 'Кабінет мешканця';
  if (['chairman', 'accountant', 'board', 'auditor'].includes(role)) return 'Кабінет правління';
  return 'DAH';
}