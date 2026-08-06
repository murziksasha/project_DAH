'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { apiFetch, getToken } from '@/lib/api';
import {
  applyResidentApartmentSelection,
  getSelectedApartmentId,
  onApartmentChange,
  resolveResidentApartmentId,
} from '@/lib/apartment-context';

export interface ResidentApartment {
  id: string;
  number: string;
  entrance: number;
  isPrimary: boolean;
  buildingName: string;
}

/** Shown when a resident is linked to 2+ apartments. Switches without full reload. */
export function ResidentApartmentSwitcher() {
  const { t } = useI18n();
  const [list, setList] = useState<ResidentApartment[]>([]);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const profile = await apiFetch<{
        apartments?: ResidentApartment[];
        apartmentId?: string | null;
      }>('/auth/profile', { token });
      const apts = profile.apartments ?? [];
      setList(apts);
      if (apts.length <= 1) return;
      const stored = getSelectedApartmentId();
      const resolved =
        (stored && apts.some((a) => a.id === stored) && stored) ||
        resolveResidentApartmentId() ||
        apts.find((a) => a.isPrimary)?.id ||
        apts[0]?.id ||
        '';
      setSelected(resolved);
      if (resolved) applyResidentApartmentSelection(resolved, { silent: true });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return onApartmentChange((id) => setSelected(id));
  }, []);

  if (list.length <= 1) return null;

  return (
    <label className="resident-apt-switcher" title={t('residentAptSwitcher')}>
      <span className="sr-only">{t('residentAptSwitcher')}</span>
      <select
        value={selected}
        aria-label={t('residentAptSwitcher')}
        disabled={busy}
        onChange={(e) => {
          const id = e.target.value;
          if (!id || id === selected) return;
          setBusy(true);
          setSelected(id);
          applyResidentApartmentSelection(id);
          // Pages listen for APARTMENT_CHANGE_EVENT and re-fetch
          window.setTimeout(() => setBusy(false), 400);
        }}
      >
        {list.map((a) => (
          <option key={a.id} value={a.id}>
            {t('residentApt', { number: a.number })}
            {a.buildingName ? ` · ${a.buildingName}` : ''}
            {a.isPrimary ? ` (${t('residentAptPrimary')})` : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
