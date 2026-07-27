import { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: ReactNode;
  tone?: 'default' | 'success' | 'danger' | 'muted';
  hint?: string;
}

export function StatCard({ label, value, tone = 'default', hint }: StatCardProps) {
  return (
    <div className={`card stat-card tone-${tone}`}>
      <div className="stat-label">{label}</div>
      <div className={`stat-value tone-${tone}`}>{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}
