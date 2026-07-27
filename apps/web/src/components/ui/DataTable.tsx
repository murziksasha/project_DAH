import { ReactNode } from 'react';

export interface DataColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: DataColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: ReactNode;
  loading?: boolean;
}

export function DataTable<T>({ columns, rows, rowKey, empty, loading }: DataTableProps<T>) {
  if (loading) {
    return <p style={{ color: 'var(--muted)' }}>Завантаження…</p>;
  }
  if (!rows.length) {
    return <>{empty ?? <p style={{ color: 'var(--muted)' }}>Немає даних</p>}</>;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={c.className}
                style={{
                  textAlign: 'left',
                  padding: '0.5rem 0.65rem',
                  borderBottom: '1px solid var(--border)',
                  fontSize: '0.8rem',
                  color: 'var(--muted)',
                  fontWeight: 600,
                }}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={c.className}
                  style={{
                    padding: '0.55rem 0.65rem',
                    borderBottom: '1px solid var(--border)',
                    fontSize: '0.9rem',
                  }}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
