import { Scissors } from 'lucide-react';
import { useReviewStore } from '../../store.js';
import { buildSegments, buildStats } from '../../lib/segments.js';

function fmt(seconds) {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  return `${Math.floor(seconds / 60)}m ${(seconds % 60).toFixed(1)}s`;
}

export function StatsBar() {
  const filename      = useReviewStore((s) => s.filename);
  const timeline      = useReviewStore((s) => s.timeline);
  const maxGapSeconds = useReviewStore((s) => s.maxGapSeconds);

  const segments = buildSegments(timeline, maxGapSeconds);
  const { wordsKept, wordsRemoved, silencesCut, outputSeconds } = buildStats(timeline, segments);

  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-neutral-800 bg-neutral-950 px-5">
      <Scissors size={14} className="text-emerald-400 shrink-0" strokeWidth={2.5} />
      <span className="text-sm font-semibold tracking-tight text-white">AI Clipper</span>

      {filename && (
        <>
          <span className="text-neutral-700">·</span>
          <span className="max-w-xs truncate text-xs text-neutral-400" title={filename}>
            {filename}
          </span>
        </>
      )}

      <div className="ml-auto flex items-center gap-1 text-xs text-neutral-500 tabular-nums">
        <span className="text-neutral-300">{wordsKept}</span> kept
        <span className="mx-1 text-neutral-700">·</span>
        <span className="text-neutral-400">{wordsRemoved}</span> removed
        <span className="mx-1 text-neutral-700">·</span>
        <span className="text-neutral-500">{silencesCut}</span> silences
        <span className="mx-1 text-neutral-700">·</span>
        <span className="font-medium text-emerald-400">{fmt(outputSeconds)}</span> output
      </div>
    </header>
  );
}
