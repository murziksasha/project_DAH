import type { DocumentTemplatesConfig } from '@dah/shared';

export type DeferredSetupRole = 'accountant' | 'auditor';

/** Current settings document version (bump when migrating shape). */
export const BUILDING_SETTINGS_SCHEMA_VERSION = 2;

export interface BuildingSettingsJson {
  /** Document schema version for migrations */
  schemaVersion?: number;
  registrationEnabled?: boolean;
  /**
   * If set, self-registration requires this invite code (not listed publicly).
   * Protects apartment enumeration + open sign-up.
   */
  registrationInviteCode?: string;
  showBankDetailsToResidents?: boolean;
  defaultAccrualDueDays?: number;
  /** Days before due date to email debt reminders (worker). */
  reminderDaysBeforeDue?: number;
  /**
   * Day of month by which residents should submit meter readings (1–28).
   * Default 5. Used for home deadline banner.
   */
  metersReadingDeadlineDay?: number;
  locale?: 'uk' | 'ru';
  /** Ролі, відкладені на етапі майстра налаштування */
  deferredSetupRoles?: DeferredSetupRole[];
  /**
   * SLA response hours by request category (dispatcher).
   * Keys: sanitary | electric | cleaning | elevator | heating | other | default
   */
  slaHoursByCategory?: Record<string, number>;
  /**
   * Expenses at or above this amount (UAH) require second approval (dual control).
   * null/undefined = disabled.
   */
  expenseDualApprovalThreshold?: number | null;
  /** Require TOTP for chairman/accountant/board before finance actions (default true in prod). */
  requireFinance2fa?: boolean;
  /**
   * Late payment penalty (пеня). Worker creates daily accrual lines when enabled.
   * annualRatePercent: e.g. 120 = 120% per year; daily = annual/365/100 * debt.
   */
  penalty?: {
    enabled?: boolean;
    annualRatePercent?: number;
    graceDays?: number;
    /** Max penalty per apartment per day (UAH), 0 = no cap */
    dailyCap?: number;
    /** Fund id for penalty accruals (optional — first maintenance fund) */
    fundId?: string | null;
  };
  /**
   * Deep accounting flags (GL SoT cutover path).
   * journalSot: read balances/reports from journal projectors (writes still dual-run).
   * Env JOURNAL_SOT=true|false overrides this.
   */
  finance?: {
    journalSot?: boolean;
    strictBankRec?: boolean;
    defaultCashFlowSource?: 'legacy' | 'journal' | 'both';
  };
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
    const o = raw as BuildingSettingsJson;
    return migrateBuildingSettings(o);
  }
  return { schemaVersion: BUILDING_SETTINGS_SCHEMA_VERSION };
}

/** Normalize / migrate older JSON blobs to current schemaVersion. */
export function migrateBuildingSettings(settings: BuildingSettingsJson): BuildingSettingsJson {
  const next: BuildingSettingsJson = { ...settings };
  const v = next.schemaVersion ?? 1;
  if (v < 2) {
    // v1→v2: ensure features object defaults present when partial
    if (next.features && typeof next.features === 'object') {
      next.features = { ...next.features };
    }
    next.schemaVersion = BUILDING_SETTINGS_SCHEMA_VERSION;
  }
  if (next.metersReadingDeadlineDay != null) {
    const d = Number(next.metersReadingDeadlineDay);
    if (!Number.isFinite(d) || d < 1 || d > 28) {
      next.metersReadingDeadlineDay = 5;
    }
  }
  if (next.defaultAccrualDueDays != null) {
    const d = Number(next.defaultAccrualDueDays);
    if (!Number.isFinite(d) || d < 1 || d > 90) {
      next.defaultAccrualDueDays = 14;
    }
  }
  return next;
}

/**
 * Validate settings patch before merge (throws string messages).
 * Lightweight runtime checks — no Zod dependency.
 */
export function assertValidBuildingSettingsPatch(patch: BuildingSettingsJson): void {
  if (patch.locale && patch.locale !== 'uk' && patch.locale !== 'ru') {
    throw new Error('locale must be uk | ru');
  }
  if (patch.metersReadingDeadlineDay != null) {
    const d = Number(patch.metersReadingDeadlineDay);
    if (!Number.isFinite(d) || d < 1 || d > 28) {
      throw new Error('metersReadingDeadlineDay must be 1–28');
    }
  }
  if (patch.expenseDualApprovalThreshold != null) {
    const n = Number(patch.expenseDualApprovalThreshold);
    if (!Number.isFinite(n) || n < 0) {
      throw new Error('expenseDualApprovalThreshold must be ≥ 0');
    }
  }
  if (patch.slaHoursByCategory) {
    for (const [k, v] of Object.entries(patch.slaHoursByCategory)) {
      if (!Number.isFinite(Number(v)) || Number(v) < 0) {
        throw new Error(`slaHoursByCategory.${k} must be a non-negative number`);
      }
    }
  }
  if (patch.penalty) {
    if (
      patch.penalty.annualRatePercent != null &&
      (!Number.isFinite(Number(patch.penalty.annualRatePercent)) ||
        Number(patch.penalty.annualRatePercent) < 0)
    ) {
      throw new Error('penalty.annualRatePercent must be ≥ 0');
    }
    if (
      patch.penalty.graceDays != null &&
      (!Number.isFinite(Number(patch.penalty.graceDays)) || Number(patch.penalty.graceDays) < 0)
    ) {
      throw new Error('penalty.graceDays must be ≥ 0');
    }
  }
}

export function mergeBuildingSettings(
  raw: unknown,
  patch: BuildingSettingsJson,
): BuildingSettingsJson {
  assertValidBuildingSettingsPatch(patch);
  const base = parseBuildingSettings(raw);
  const next = migrateBuildingSettings({
    ...base,
    ...patch,
    schemaVersion: BUILDING_SETTINGS_SCHEMA_VERSION,
  });
  // Deep-merge finance flags so partial patch does not wipe siblings
  if (patch.finance || base.finance) {
    next.finance = {
      ...(base.finance ?? {}),
      ...(patch.finance ?? {}),
    };
  }
  return next;
}