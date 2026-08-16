import {
  parseBuildingSettings,
  type BuildingSettingsJson,
} from '../../modules/building/building-settings';

/**
 * Journal-as-SoT read path.
 * Priority: env JOURNAL_SOT=true|false overrides building settings.
 * Building: settings.finance.journalSot
 */
export function isJournalSotEnabled(
  settingsRaw?: unknown,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const envVal = (env.JOURNAL_SOT ?? '').trim().toLowerCase();
  if (envVal === '1' || envVal === 'true' || envVal === 'yes') return true;
  if (envVal === '0' || envVal === 'false' || envVal === 'no') return false;
  const s = parseBuildingSettings(settingsRaw);
  return !!s.finance?.journalSot;
}

export function defaultCashFlowSource(
  settingsRaw?: unknown,
  env: NodeJS.ProcessEnv = process.env,
): 'legacy' | 'journal' | 'both' {
  if (isJournalSotEnabled(settingsRaw, env)) return 'journal';
  const s = parseBuildingSettings(settingsRaw);
  const src = s.finance?.defaultCashFlowSource;
  if (src === 'journal' || src === 'both' || src === 'legacy') return src;
  return 'legacy';
}

export function financeFlags(settingsRaw?: unknown, env: NodeJS.ProcessEnv = process.env) {
  const s = parseBuildingSettings(settingsRaw);
  return {
    journalSot: isJournalSotEnabled(settingsRaw, env),
    strictBankRec: !!s.finance?.strictBankRec,
    defaultCashFlowSource: defaultCashFlowSource(settingsRaw, env),
    envOverride: !!(env.JOURNAL_SOT ?? '').trim(),
  };
}

export type { BuildingSettingsJson };
