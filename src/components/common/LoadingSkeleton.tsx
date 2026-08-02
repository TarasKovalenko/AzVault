interface LoadingSkeletonProps {
  rows?: number;
  columns?: number[];
}

export function LoadingSkeleton({
  rows = 8,
  columns = [30, 10, 15, 20, 15, 10],
}: LoadingSkeletonProps) {
  return (
    <output className="block py-2" aria-label="Loading">
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="flex items-center gap-3 px-3 py-2.5">
          {columns.map((width, column) => (
            <div
              key={column}
              className="h-3.5 rounded bg-[linear-gradient(90deg,var(--surface-muted)_0%,var(--surface-hover)_50%,var(--surface-muted)_100%)] bg-[length:480px_100%] animate-[shimmer_1.5s_ease-in-out_infinite]"
              style={{ width: `${width}%`, opacity: Math.max(0.3, 1 - row * 0.08) }}
            />
          ))}
        </div>
      ))}
    </output>
  );
}
