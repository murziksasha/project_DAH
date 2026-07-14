import Link from 'next/link';

interface EmptyStateProps {
  title: string;
  description?: string;
  actionHref?: string;
  actionLabel?: string;
}

export function EmptyState({ title, description, actionHref, actionLabel }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <p className="empty-state-title">{title}</p>
      {description && <p className="empty-state-desc">{description}</p>}
      {actionHref && actionLabel && (
        <Link href={actionHref} className="btn btn-sm" style={{ marginTop: '0.75rem' }}>
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
