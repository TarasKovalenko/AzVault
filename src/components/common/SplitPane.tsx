import { tokens } from '@fluentui/react-components';
import { useCallback, useEffect, useRef, useState } from 'react';

interface SplitPaneProps {
  left: React.ReactNode;
  right: React.ReactNode;
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
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    setRatio(defaultRatio);
  }, [defaultRatio]);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      dragging.current = true;
      e.preventDefault();

      const handleEl = e.currentTarget as HTMLDivElement;
      handleEl.classList.add('dragging');

      const onMouseMove = (ev: MouseEvent) => {
        if (!containerRef.current || !dragging.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const newRatio = Math.max(
          minLeft / rect.width,
          Math.min((ev.clientX - rect.left) / rect.width, 1 - minRight / rect.width),
        );
        setRatio(newRatio);
      };

      const onMouseUp = () => {
        dragging.current = false;
        handleEl.classList.remove('dragging');
        onRatioChange?.(ratio);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [minLeft, minRight, onRatioChange, ratio],
  );

  if (!rightVisible) {
    return (
      <div
        ref={containerRef}
        style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}
      >
        <div
          style={{
            flex: 1,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          {left}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
      <div
        style={{
          width: `${ratio * 100}%`,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        {left}
      </div>
      {/* biome-ignore lint/a11y/useSemanticElements: hr doesn't support mouse drag semantics */}
      <div
        className="azv-split-handle"
        onMouseDown={onMouseDown}
        onDoubleClick={() => onRatioChange?.(1)}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panels"
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        tabIndex={0}
      />
      <div
        style={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          background: tokens.colorNeutralBackground1,
          borderLeft: `1px solid ${tokens.colorNeutralStroke2}`,
        }}
      >
        {right}
      </div>
    </div>
  );
}
