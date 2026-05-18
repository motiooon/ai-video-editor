import { useReviewStore } from '../../store.js';
import { videoRef } from '../../lib/videoRef.js';
import { REMOVAL_COLORS, REMOVAL_TOOLTIPS } from '../../theme/index.js';

export function WordChip({ item, index, isActive, ref }) {
  const toggleItem   = useReviewStore((s) => s.toggleItem);
  const isPreviewing = useReviewStore((s) => s.isPreviewing);

  const handleClick = () => toggleItem(index);

  const handleMouseEnter = () => {
    if (!isPreviewing && videoRef.current) {
      videoRef.current.currentTime = item.start;
    }
  };

  const color = item.removed ? (REMOVAL_COLORS[item.reason] ?? '#6b7280') : undefined;

  const tooltip = item.removed
    ? (REMOVAL_TOOLTIPS[item.reason] ?? 'Removed — click to restore')
    : 'Click to remove';

  return (
    <span
      ref={ref}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      title={tooltip}
      className={[
        'inline cursor-pointer rounded px-0.5 transition-colors duration-100',
        item.removed
          ? 'line-through opacity-40 decoration-[1.5px] hover:opacity-60'
          : 'hover:bg-black/[0.07]',
        isActive && !item.removed && 'bg-yellow-300/60 text-yellow-900',
      ].filter(Boolean).join(' ')}
      style={item.removed ? { color, textDecorationColor: color } : undefined}
    >
      {item.word}
    </span>
  );
}
