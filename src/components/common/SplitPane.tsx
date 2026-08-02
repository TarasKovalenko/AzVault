import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../ui/cn';

interface SplitPaneProps {
  left: ReactNode;
  right: ReactNode;
  rightVisible?: boolean;
  defaultRatio?: number;
  minLeft?: number;
  minRight?: number;
  onRatioChange?: (ratio: number) => void;
}

export function SplitPane({
  left,
  right,
  rightVisible = true,
  defaultRatio = 0.6,
  minLeft = 360,
  minRight = 280,
  onRatioChange,
}: SplitPaneProps) {
  const [ratio, setRatio] = useState(defaultRatio);
  const [dragging, setDragging] = useState(false);
  const ratioRef = useRef(ratio);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRatio(defaultRatio);
    ratioRef.current = defaultRatio;
  }, [defaultRatio]);

  const onMouseDown = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      setDragging(true);

      const onMouseMove = (moveEvent: MouseEvent) => {
        const container = containerRef.current;
        if (!container) return;
        const bounds = container.getBoundingClientRect();
        const nextRatio = Math.max(
          minLeft / bounds.width,
          Math.min((moveEvent.clientX - bounds.left) / bounds.width, 1 - minRight / bounds.width),
        );
        ratioRef.current = nextRatio;
        setRatio(nextRatio);
      };

      const onMouseUp = () => {
        setDragging(false);
        onRatioChange?.(ratioRef.current);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [minLeft, minRight, onRatioChange],
  );

  return (
    <div ref={containerRef} className="flex min-h-0 flex-1 overflow-hidden">
      <div
        className="flex min-h-0 flex-col overflow-hidden"
        style={rightVisible ? { width: `${ratio * 100}%` } : { flex: 1 }}
      >
        {left}
      </div>
      {rightVisible && (
        <>
          {/* biome-ignore lint/a11y/useSemanticElements: interactive resize separator */}
          <div
            role="separator"
            aria-label="Resize panels"
            aria-orientation="vertical"
            aria-valuenow={Math.round(ratio * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            tabIndex={0}
            onMouseDown={onMouseDown}
            className={cn(
              'group relative z-10 w-px shrink-0 cursor-col-resize bg-[var(--stroke)] transition-colors after:absolute after:-left-1 after:top-0 after:h-full after:w-[9px] hover:bg-[var(--accent)]',
              dragging && 'bg-[var(--accent)]',
            )}
          />
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--surface-solid)]">
            {right}
          </div>
        </>
      )}
    </div>
  );
}
