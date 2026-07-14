export type Locale = 'uk' | 'ru';

const STORAGE_KEY = 'dah_locale';

const DICT = {
  uk: {
    appName: 'DAH',
    boardCabinet: 'Кабінет правління',
    residentCabinet: 'Кабінет мешканця',
    setupTitle: 'Налаштування ОСМД',
    home: 'Домівка',
    logout: 'Вихід',
    login: 'Вхід',
    dashboard: 'Дашборд',
    reports: 'Звіти',
    expenses: 'Витрати',
    newExpense: 'Нова витрата',
    expenseList: 'Список витрат',
    suppliers: 'Довідники',
    funds: 'Фонди',
    accruals: 'Нарахування',
    payments: 'Платежі',
    documents: 'Документи',
    residents: 'Мешканці',
    settings: 'Налаштування',
    communications: 'Оголошення та заявки',
    reminders: 'Нагадування',
    security: 'Безпека / 2FA',
    audit: 'Аудит',
    instructions: 'Інструкція користування',
    search: 'Пошук квартири…',
    debt: 'Борг',
    paid: 'Сплачено',
    save: 'Зберегти',
    loading: 'Завантаження…',
    language: 'Мова інтерфейсу',
    receiptsZip: 'ZIP квитанцій',
    receiptsPdf: 'PDF (усі)',
    apartmentAccount: 'Особовий рахунок',
    noData: 'Немає даних',
    overview: 'Огляд',
    finance: 'Фінанси',
    building: 'Будинок',
    ops: 'Операції',
    control: 'Контроль',
    comms: 'Комунікації',
  },
  ru: {
    appName: 'DAH',
    boardCabinet: 'Кабинет правления',
    residentCabinet: 'Кабинет жильца',
    setupTitle: 'Настройка ОСМД',
    home: 'Главная',
    logout: 'Выход',
    login: 'Вход',
    dashboard: 'Дашборд',
    reports: 'Отчёты',
    expenses: 'Расходы',
    newExpense: 'Новый расход',
    expenseList: 'Список расходов',
    suppliers: 'Справочники',
    funds: 'Фонды',
    accruals: 'Начисления',
    payments: 'Платежи',
    documents: 'Документы',
    residents: 'Жильцы',
    settings: 'Настройки',
    communications: 'Объявления и заявки',
    reminders: 'Напоминания',
    security: 'Безопасность / 2FA',
    audit: 'Аудит',
    instructions: 'Инструкция',
    search: 'Поиск квартиры…',
    debt: 'Долг',
    paid: 'Оплачено',
    save: 'Сохранить',
    loading: 'Загрузка…',
    language: 'Язык интерфейса',
    receiptsZip: 'ZIP квитанций',
    receiptsPdf: 'PDF (все)',
    apartmentAccount: 'Лицевой счёт',
    noData: 'Нет данных',
    overview: 'Обзор',
    finance: 'Финансы',
    building: 'Дом',
    ops: 'Операции',
    control: 'Контроль',
    comms: 'Коммуникации',
  },
} as const;

export type I18nKey = keyof (typeof DICT)['uk'];

export function getStoredLocale(): Locale {
  if (typeof window === 'undefined') return 'uk';
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw === 'ru' ? 'ru' : 'uk';
}

export function setStoredLocale(locale: Locale) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, locale);
  document.documentElement.lang = locale;
}

export function t(key: I18nKey, locale?: Locale): string {
  const loc = locale ?? (typeof window !== 'undefined' ? getStoredLocale() : 'uk');
  return DICT[loc][key] ?? DICT.uk[key] ?? key;
}

/** Map known nav href → i18n key for labels */
export function navLabelForHref(href: string, fallback: string, locale?: Locale): string {
  const map: Record<string, I18nKey> = {
    '/admin': 'dashboard',
    '/admin/search': 'search',
    '/admin/reports': 'reports',
    '/admin/expenses': 'newExpense',
    '/admin/expenses/list': 'expenseList',
    '/admin/suppliers': 'suppliers',
    '/admin/funds': 'funds',
    '/admin/accruals': 'accruals',
    '/admin/accruals/list': 'accruals',
    '/admin/payments': 'payments',
    '/admin/documents': 'documents',
    '/admin/residents': 'residents',
    '/admin/settings': 'settings',
    '/admin/communications': 'communications',
    '/admin/reminders': 'reminders',
    '/admin/ops': 'ops',
    '/admin/security': 'security',
    '/admin/audit': 'audit',
    '/resident': 'residentCabinet',
  };
  const key = map[href];
  if (!key) return fallback;
  return t(key, locale);
}

export function groupLabel(id: string, fallback: string, locale?: Locale): string {
  const map: Record<string, I18nKey> = {
    overview: 'overview',
    finance: 'finance',
    building: 'building',
    comms: 'comms',
    ops: 'ops',
    control: 'control',
  };
  const key = map[id];
  return key ? t(key, locale) : fallback;
}
