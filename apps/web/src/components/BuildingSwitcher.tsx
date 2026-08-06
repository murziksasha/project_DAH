'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { apiFetch, getToken } from '@/lib/api';
import { getSelectedBuildingId, setSelectedBuildingId } from '@/lib/building-context';

interface BuildingRow {
  id: string;
  name: string;
  address: string;
  _count?: { apartments: number };
}

export function BuildingSwitcher() {
  const { t } = useI18n();
  const [buildings, setBuildings] = useState<BuildingRow[]>([]);
  const [selected, setSelected] = useState<string>('');

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const list = await apiFetch<BuildingRow[]>('/building/list', { token });
      setBuildings(list);
      const stored = getSelectedBuildingId();
      if (stored && list.some((b) => b.id === stored)) {
        setSelected(stored);
      } else if (list[0]) {
        setSelected(list[0].id);
        setSelectedBuildingId(list[0].id);
      }
    } catch {
      // ignore — single-building installs still work
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (buildings.length <= 1) return null;

  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
      <span style={{ color: 'var(--muted)' }}>{t('buildingSwitcher')}</span>
      <select
        value={selected}
        onChange={(e) => {
          setSelected(e.target.value);
          setSelectedBuildingId(e.target.value);
          // Force pages that loaded once on mount to re-fetch scoped data
          window.location.reload();
        }}
        style={{ maxWidth: 180 }}
      >
        {buildings.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
            {b._count?.apartments != null ? ` (${b._count.apartments})` : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
