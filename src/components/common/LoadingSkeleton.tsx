import { makeStyles } from '@fluentui/react-components';

interface LoadingSkeletonProps {
  rows?: number;
  columns?: number[];
}

const useStyles = makeStyles({
  root: {
    padding: '8px 0',
  },
});

export function LoadingSkeleton({
  rows = 8,
  columns = [30, 10, 15, 20, 15, 10],
}: LoadingSkeletonProps) {
  const classes = useStyles();

  return (
    <div className={classes.root}>
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
