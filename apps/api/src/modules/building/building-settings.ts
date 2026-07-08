export interface BuildingSettingsJson {
  registrationEnabled?: boolean;
  showBankDetailsToResidents?: boolean;
  defaultAccrualDueDays?: number;
  locale?: 'uk' | 'ru';
  features?: {
    polls?: boolean;
    requests?: boolean;
    webPush?: boolean;
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