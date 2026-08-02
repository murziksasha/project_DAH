'use client';

import { useI18n } from '@/components/LocaleProvider';
import { getInstructionsForRole } from '@/lib/instructions-content';
import { getStoredUser } from '@/lib/auth';
import type { I18nKey } from '@/lib/i18n';

const ROLE_I18N: Record<string, I18nKey> = {
  super_admin: 'roleSuperAdmin',
  chairman: 'roleChairman',
  accountant: 'roleAccountant',
  board: 'roleBoard',
  auditor: 'roleAuditor',
  resident: 'roleResident',
};

export default function InstructionsView() {
  const { t, locale } = useI18n();
  const user = getStoredUser();

  if (!user) return null;

  const content = getInstructionsForRole(user.role, locale);
  const roleKey = ROLE_I18N[user.role];
  const roleName = roleKey ? t(roleKey) : user.role;

  return (
    <main>
      <h1 style={{ marginBottom: '0.5rem' }}>{content.title}</h1>
      <p style={{ color: 'var(--muted)', marginBottom: '1.5rem' }}>
        {t('instructionsRole')} {roleName}
      </p>

      <section className="card" style={{ marginBottom: '1rem' }}>
        <p style={{ lineHeight: 1.6 }}>{content.intro}</p>
      </section>

      {content.sections.map((section) => (
        <section key={section.title} className="card" style={{ marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>{section.title}</h2>
          <ol style={{ paddingLeft: '1.25rem', display: 'grid', gap: '0.5rem', lineHeight: 1.5 }}>
            {section.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </section>
      ))}
    </main>
  );
}
