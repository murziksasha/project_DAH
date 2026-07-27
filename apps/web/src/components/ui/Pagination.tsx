import { Button } from './Button';

interface PaginationProps {
  page: number;
  totalPages: number;
  total?: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, totalPages, total, onChange }: PaginationProps) {
  if (totalPages <= 1) return null;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        marginTop: 12,
      }}
    >
      <Button
        variant="ghost"
        size="sm"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        Назад
      </Button>
      <span style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>
        Стор. {page} / {totalPages}
        {total != null ? ` · ${total}` : ''}
      </span>
      <Button
        variant="ghost"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        Далі
      </Button>
    </div>
  );
}
