/** Organization type from API (Tenant.orgType). */
export type OrganizationType = 'osbb' | 'management_company';

export type OrgLabels = {
  orgNoun: string;
  orgNounFull: string;
  boardCabinet: string;
  setupTitle: string;
  chairman: string;
  board: string;
  dispatcher: string;
  crew: string;
  accountant: string;
  auditor: string;
  resident: string;
  buildings: string;
  tenantsNav: string;
};

const OSBB: OrgLabels = {
  orgNoun: 'ОСББ',
  orgNounFull: 'об’єднання співвласників',
  boardCabinet: 'Кабінет правління',
  setupTitle: 'Налаштування ОСББ',
  chairman: 'Голова правління',
  board: 'Член правління',
  dispatcher: 'Диспетчер',
  crew: 'Бригада',
  accountant: 'Бухгалтер',
  auditor: 'Ревізійна комісія',
  resident: 'Мешканець',
  buildings: 'Будинки',
  tenantsNav: 'Організації',
};

const UK: OrgLabels = {
  orgNoun: 'УК',
  orgNounFull: 'управляюча компанія',
  boardCabinet: 'Кабінет УК',
  setupTitle: 'Налаштування УК',
  chairman: 'Керівник',
  board: 'Працівник УК',
  dispatcher: 'Диспетчер',
  crew: 'Бригада',
  accountant: 'Бухгалтер',
  auditor: 'Контроль',
  resident: 'Мешканець',
  buildings: 'Об’єкти',
  tenantsNav: 'Організації',
};

export function labelsForOrg(orgType?: OrganizationType | string | null): OrgLabels {
  if (orgType === 'management_company') return UK;
  return OSBB;
}

export function orgTypeLabel(orgType?: OrganizationType | string | null): string {
  return orgType === 'management_company' ? 'Управляюча компанія (УК)' : 'ОСББ';
}

/** Role code → display name for given org. */
export function roleLabel(
  role: string,
  orgType?: OrganizationType | string | null,
): string {
  const L = labelsForOrg(orgType);
  switch (role) {
    case 'chairman':
      return L.chairman;
    case 'board':
      return L.board;
    case 'dispatcher':
      return L.dispatcher;
    case 'crew':
      return L.crew;
    case 'accountant':
      return L.accountant;
    case 'auditor':
      return L.auditor;
    case 'resident':
      return L.resident;
    case 'super_admin':
      return 'Системний адміністратор';
    default:
      return role;
  }
}
