import {
  BUILDING_SETTINGS_SCHEMA_VERSION,
  assertValidBuildingSettingsPatch,
  mergeBuildingSettings,
  parseBuildingSettings,
} from './building-settings';

describe('building-settings', () => {
  it('parses empty as schemaVersion 2', () => {
    expect(parseBuildingSettings(null).schemaVersion).toBe(BUILDING_SETTINGS_SCHEMA_VERSION);
  });

  it('migrates v1 blob', () => {
    const s = parseBuildingSettings({ registrationEnabled: false });
    expect(s.schemaVersion).toBe(2);
    expect(s.registrationEnabled).toBe(false);
  });

  it('clamps invalid deadline day', () => {
    const s = parseBuildingSettings({ metersReadingDeadlineDay: 99 });
    expect(s.metersReadingDeadlineDay).toBe(5);
  });

  it('rejects bad locale on patch', () => {
    expect(() =>
      assertValidBuildingSettingsPatch({ locale: 'en' as 'uk' }),
    ).toThrow(/locale/);
  });

  it('merge keeps schemaVersion', () => {
    const m = mergeBuildingSettings({}, { showBankDetailsToResidents: false });
    expect(m.schemaVersion).toBe(2);
    expect(m.showBankDetailsToResidents).toBe(false);
  });
});
