import type { DocumentTemplatesConfig } from '@dah/shared';

export type DeferredSetupRole = 'accountant' | 'auditor';

export interface BuildingSettingsJson {
  registrationEnabled?: boolean;
  showBankDetailsToResidents?: boolean;
  defaultAccrualDueDays?: number;
  /** Days before due date to email debt reminders (worker). */
  reminderDaysBeforeDue?: number;
  locale?: 'uk' | 'ru';
  /** Ролі, відкладені на етапі майстра налаштування */
  deferredSetupRoles?: DeferredSetupRole[];
  /**
   * SLA response hours by request category (dispatcher).
   * Keys: sanitary | electric | cleaning | elevator | heating | other | default
   */
  slaHoursByCategory?: Record<string, number>;
  features?: {
    polls?: boolean;
    requests?: boolean;
    webPush?: boolean;
    email?: boolean;
    messenger?: boolean;
    meetings?: boolean;
    onlinePayments?: boolean;
  };
  /**
   * Constructor templates: PDF receipts / board reports + Excel export columns.
   * Shape: { forms: DocTemplate[], exports: ExportProfile[] }
   */
  documentTemplates?: DocumentTemplatesConfig;
}

export function clearDeferredSetupRole(
  raw: unknown,
  role: DeferredSetupRole,
): BuildingSettingsJson {
  const parsed = parseBuildingSettings(raw);
  const next = (parsed.deferredSetupRoles ?? []).filter((r) => r !== role);
  return {
    ...parsed,
    deferredSetupRoles: next.length > 0 ? next : undefined,
  };
}

export const DEFAULT_BUILDING_SETTINGS: Required<
  Pick<BuildingSettingsJson, 'registrationEnabled' | 'showBankDetailsToResidents' | 'defaultAccrualDueDays' | 'locale'>
> = {
  registrationEnabled: true,
  showBankDetailsToResidents: true,
  defaultAccrualDueDays: 14,
  locale: 'uk',
};

export function parseBuildingSettings(raw: unknown): BuildingSettingsJson {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as BuildingSettingsJson;
  }
  return {};
}

export function mergeBuildingSettings(
  raw: unknown,
  patch: BuildingSettingsJson,
): BuildingSettingsJson {
  return { ...parseBuildingSettings(raw), ...patch };
}