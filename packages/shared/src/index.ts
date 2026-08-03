export * from './document-templates';

export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  CHAIRMAN = 'chairman',
  ACCOUNTANT = 'accountant',
  BOARD = 'board',
  /** Dispatcher / queue operator (SLA requests, no finance). */
  DISPATCHER = 'dispatcher',
  /** Field crew — only assigned requests. */
  CREW = 'crew',
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
  BY_METER = 'by_meter',
}

export enum MeterType {
  COLD_WATER = 'cold_water',
  HOT_WATER = 'hot_water',
  HEATING = 'heating',
  ELECTRICITY = 'electricity',
  OTHER = 'other',
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

export enum RequestPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent',
}

export enum VoteWeightMode {
  ONE_PER_USER = 'one_per_user',
  ONE_PER_APARTMENT = 'one_per_apartment',
  BY_AREA = 'by_area',
}

export enum JournalEntryType {
  ACCRUAL = 'accrual',
  PAYMENT = 'payment',
  EXPENSE = 'expense',
  VOID_PAYMENT = 'void_payment',
  VOID_EXPENSE = 'void_expense',
  OPENING = 'opening',
}

export const FUND_LABELS: Record<FundType, { uk: string; ru: string }> = {
  [FundType.MAINTENANCE]: { uk: 'Фонд утримання', ru: 'Фонд содержания' },
  [FundType.CAPITAL_REPAIR]: { uk: 'Фонд капітального ремонту', ru: 'Фонд капремонта' },
  [FundType.SPECIAL]: { uk: 'Спеціальний фонд', ru: 'Специальный фонд' },
};

/** Default labels (ОСББ). For УК UI use web `roleLabel(role, orgType)`. */
export const ROLE_LABELS: Record<UserRole, { uk: string; ru: string }> = {
  [UserRole.SUPER_ADMIN]: { uk: 'Системний адміністратор', ru: 'Системный администратор' },
  [UserRole.CHAIRMAN]: { uk: 'Голова правління / керівник', ru: 'Председатель / руководитель' },
  [UserRole.ACCOUNTANT]: { uk: 'Бухгалтер', ru: 'Бухгалтер' },
  [UserRole.BOARD]: { uk: 'Член правління / працівник УК', ru: 'Член правления / сотрудник УК' },
  [UserRole.DISPATCHER]: { uk: 'Диспетчер', ru: 'Диспетчер' },
  [UserRole.CREW]: { uk: 'Бригада / виконавець', ru: 'Бригада / исполнитель' },
  [UserRole.RESIDENT]: { uk: 'Мешканець', ru: 'Жилец' },
  [UserRole.AUDITOR]: { uk: 'Ревізійна комісія / контроль', ru: 'Ревизионная комиссия / контроль' },
};

export const REQUEST_PRIORITY_LABELS: Record<RequestPriority, { uk: string; ru: string }> = {
  [RequestPriority.LOW]: { uk: 'Низький', ru: 'Низкий' },
  [RequestPriority.NORMAL]: { uk: 'Звичайний', ru: 'Обычный' },
  [RequestPriority.HIGH]: { uk: 'Високий', ru: 'Высокий' },
  [RequestPriority.URGENT]: { uk: 'Терміновий', ru: 'Срочный' },
};