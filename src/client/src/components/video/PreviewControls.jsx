import { useMemo } from 'react';
import { Play, Pause } from 'lucide-react';
import { useReviewStore } from '../../store.js';
import { buildSegments } from '../../lib/segments.js';
import { Button } from '../common/index.js';

export function PreviewControls({ isPlaying, onPlayPause, onStartPreview }) {
  const isPreviewing  = useReviewStore((s) => s.isPreviewing);
  const currentSegIdx = useReviewStore((s) => s.currentSegIdx);
  const timeline      = useReviewStore((s) => s.timeline);
  const maxGapSeconds = useReviewStore((s) => s.maxGapSeconds);

  const segCount = useMemo(
    () => buildSegments(timeline, maxGapSeconds).filter((s) => s.end > s.start).length,
    [timeline, maxGapSeconds]
  );

  return (
    <div className="flex h-11 shrink-0 items-center justify-center gap-3 border-t border-white/[0.05]">
      {!isPreviewing ? (
        <Button variant="secondary" size="sm" icon={<Play size={13} />} onClick={onStartPreview}>
          Preview edited
        </Button>
      ) : (
        <>
          <Button
            variant="secondary"
            size="sm"
            icon={isPlaying ? <Pause size={13} /> : <Play size={13} />}
            onClick={onPlayPause}
          >
            {isPlaying ? 'Pause' : 'Resume'}
          </Button>
          <span className="text-xs text-neutral-500 tabular-nums">
            {currentSegIdx + 1} / {segCount}
          </span>
        </>
      )}
    </div>
  );
}
