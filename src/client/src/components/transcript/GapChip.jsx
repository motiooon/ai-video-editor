import { useReviewStore } from '../../store.js';
import { videoRef } from '../../lib/videoRef.js';

export function GapChip({ item, index }) {
  const toggleItem   = useReviewStore((s) => s.toggleItem);
  const isPreviewing = useReviewStore((s) => s.isPreviewing);

  const width = Math.min(48, Math.max(12, Math.round(item.duration * 30)));

  const tooltip = item.removed
    ? `Silence cut: ${item.duration.toFixed(2)}s — click to restore`
    : `Silence: ${item.duration.toFixed(2)}s — click to cut`;

  return (
    <span
      title={tooltip}
      onClick={() => toggleItem(index)}
      onMouseEnter={() => { if (!isPreviewing && videoRef.current) videoRef.current.currentTime = item.start; }}
      className="inline-block align-middle cursor-pointer mx-1 transition-opacity duration-100"
      style={{ width: `${width}px` }}
    >
      <span
        className={['block rounded-full', item.removed ? 'opacity-20' : 'opacity-35 hover:opacity-55'].join(' ')}
        style={{ height: '3px', background: item.removed ? '#9ca3af' : '#374151' }}
      />
    </span>
  );
}
