import { Play, Square, Pause } from 'lucide-react';
import { useReviewStore } from '../../store.js';
import { Button } from '../common/index.js';

export function PreviewControls({ onPlayPause, onStartPreview, onStopPreview, isPlaying }) {
  const isPreviewing  = useReviewStore((s) => s.isPreviewing);
  const previewSegs   = useReviewStore((s) => s.previewSegs);
  const currentSegIdx = useReviewStore((s) => s.currentSegIdx);

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-t border-white/[0.05] px-3">
      <Button
        variant="ghost"
        size="sm"
        icon={isPlaying ? <Pause size={14} /> : <Play size={14} />}
        onClick={onPlayPause}
        title={isPlaying ? 'Pause' : 'Play'}
      />

      <span className="h-4 w-px bg-white/[0.08]" />

      {!isPreviewing ? (
        <Button
          variant="secondary"
          size="sm"
          icon={<Play size={13} />}
          onClick={onStartPreview}
        >
          Preview edited
        </Button>
      ) : (
        <>
          <Button
            variant="ghost"
            size="sm"
            icon={<Square size={13} />}
            onClick={onStopPreview}
          >
            Stop
          </Button>
          <span className="text-xs text-neutral-500 tabular-nums">
            {currentSegIdx + 1} / {previewSegs.length}
          </span>
        </>
      )}
    </div>
  );
}
