'use client';

import { getInstructionsForRole, getRoleLabel } from '@/lib/instructions-content';
import { getStoredUser } from '@/lib/auth';

export default function InstructionsView() {
  const user = getStoredUser();

  if (!user) return null;

  const content = getInstructionsForRole(user.role);
  const roleLabel = getRoleLabel(user.role);

  return (
    <main>
      <h1 style={{ marginBottom: '0.5rem' }}>{content.title}</h1>
      <p style={{ color: 'var(--muted)', marginBottom: '1.5rem' }}>
        Роль: {roleLabel}
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