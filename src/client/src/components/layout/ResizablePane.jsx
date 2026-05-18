import { useRef, useState, useCallback } from 'react';

export function ResizablePane({ left, right, defaultSplit = 50, min = 20, max = 80 }) {
  const [leftPct, setLeftPct] = useState(defaultSplit);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startPct = useRef(defaultSplit);
  const containerRef = useRef(null);

  const onMouseDown = useCallback((e) => {
    isDragging.current = true;
    startX.current = e.clientX;
    startPct.current = leftPct;
    e.preventDefault();

    const onMove = (e) => {
      if (!isDragging.current || !containerRef.current) return;
      const delta = e.clientX - startX.current;
      const pct = startPct.current + (delta / containerRef.current.offsetWidth) * 100;
      setLeftPct(Math.min(max, Math.max(min, pct)));
    };

    const onUp = () => {
      isDragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [leftPct, min, max]);

  return (
    <div ref={containerRef} className="flex flex-1 min-h-0 overflow-hidden">
      <div className="min-h-0 overflow-hidden" style={{ width: `${leftPct}%` }}>
        {left}
      </div>

      {/* Drag handle */}
      <div
        className="group relative flex w-[5px] shrink-0 cursor-col-resize items-center justify-center bg-neutral-900 transition-colors duration-150 hover:bg-blue-500/[0.15] active:bg-blue-500/[0.25]"
        onMouseDown={onMouseDown}
      >
        <div className="h-8 w-px rounded-full bg-neutral-700 transition-colors duration-150 group-hover:bg-blue-400 group-active:bg-blue-300" />
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {right}
      </div>
    </div>
  );
}
