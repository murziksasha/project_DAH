export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  CHAIRMAN = 'chairman',
  ACCOUNTANT = 'accountant',
  BOARD = 'board',
  RESIDENT = 'resident',
  AUDITOR = 'auditor',
}

export * from './permissions';

export enum FundType {
  MAINTENANCE = 'maintenance',
  CAPITAL_REPAIR = 'capital_repair',
  SPECIAL = 'special',
}

export enum AccrualDistribution {
  BY_AREA = 'by_area',
  FIXED_PER_APARTMENT = 'fixed_per_apartment',
  MANUAL = 'manual',
}

export enum AccrualLineStatus {
  OPEN = 'open',
  PARTIALLY_PAID = 'partially_paid',
  PAID = 'paid',
  OVERDUE = 'overdue',
}

export enum PaymentSource {
  BANK = 'bank',
  CASH = 'cash',
  TRANSFER = 'transfer',
}

export enum RequestStatus {
  NEW = 'new',
  IN_PROGRESS = 'in_progress',
  DONE = 'done',
}

export const FUND_LABELS: Record<FundType, { uk: string; ru: string }> = {
  [FundType.MAINTENANCE]: { uk: 'Фонд утримання', ru: 'Фонд содержания' },
  [FundType.CAPITAL_REPAIR]: { uk: 'Фонд капітального ремонту', ru: 'Фонд капремонта' },
  [FundType.SPECIAL]: { uk: 'Спеціальний фонд', ru: 'Специальный фонд' },
};

export const ROLE_LABELS: Record<UserRole, { uk: string; ru: string }> = {
  [UserRole.SUPER_ADMIN]: { uk: 'Системний адміністратор', ru: 'Системный администратор' },
  [UserRole.CHAIRMAN]: { uk: 'Голова правління', ru: 'Председатель' },
  [UserRole.ACCOUNTANT]: { uk: 'Бухгалтер', ru: 'Бухгалтер' },
  [UserRole.BOARD]: { uk: 'Член правління', ru: 'Член правления' },
  [UserRole.RESIDENT]: { uk: 'Мешканець', ru: 'Жилец' },
  [UserRole.AUDITOR]: { uk: 'Ревізійна комісія', ru: 'Ревизионная комиссия' },
};