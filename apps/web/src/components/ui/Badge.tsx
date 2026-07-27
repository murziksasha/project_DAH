export function Badge({
  children,
  tone = 'muted',
}: {
  children: React.ReactNode;
  tone?: 'muted' | 'success' | 'danger' | 'primary' | 'warning';
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
