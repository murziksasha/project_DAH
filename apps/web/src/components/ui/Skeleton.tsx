export function Skeleton({ height = 16, width = '100%' }: { height?: number | string; width?: number | string }) {
  return (
    <div
      className="skeleton"
      style={{ height, width }}
      aria-hidden
    />
  );
}

export function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <div className="grid-2" style={{ marginBottom: '1rem' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card">
          <Skeleton height={12} width="40%" />
          <div style={{ marginTop: '0.75rem' }}>
            <Skeleton height={28} width="60%" />
          </div>
        </div>
      ))}
    </div>
  );
}
