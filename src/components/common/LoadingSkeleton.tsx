interface LoadingSkeletonProps {
  rows?: number;
  columns?: number[];
}

export function LoadingSkeleton({
  rows = 8,
  columns = [30, 10, 15, 20, 15, 10],
}: LoadingSkeletonProps) {
  return (
    <div style={{ padding: '8px 0' }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="azv-skeleton-row">
          {columns.map((width, j) => (
            <div
              key={j}
              className="azv-skeleton azv-skeleton-cell"
              style={{ width: `${width}%`, opacity: 1 - i * 0.08 }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
