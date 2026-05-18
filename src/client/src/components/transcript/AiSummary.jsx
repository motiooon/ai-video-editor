import { useReviewStore } from '../../store.js';
import { REMOVAL_COLORS, REMOVAL_LABELS } from '../../theme/index.js';

const REASON_ORDER = ['filler', 'duplicate', 'false-start', 'redundant', 'too-short', 'ai-clarity'];

export function AiSummary() {
  const timeline = useReviewStore((s) => s.timeline);

  const counts = {};
  let totalRemoved = 0;

  for (const item of timeline) {
    if (item.type !== 'word' || !item.removed) continue;
    const reason = item.reason ?? 'ai-clarity';
    counts[reason] = (counts[reason] ?? 0) + 1;
    totalRemoved++;
  }

  if (totalRemoved === 0) return null;

  const reasons = REASON_ORDER.filter((r) => counts[r] > 0);

  return (
    <div className="mb-7 rounded-xl bg-neutral-900 ring-1 ring-white/[0.06] px-4 py-3.5">
      <p className="mb-2.5 text-[11px] font-semibold text-neutral-400 uppercase tracking-widest">
        AI removed {totalRemoved} word{totalRemoved !== 1 ? 's' : ''}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {reasons.map((reason) => (
          <span
            key={reason}
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
            style={{
              background: REMOVAL_COLORS[reason] + '15',
              border: `1px solid ${REMOVAL_COLORS[reason]}35`,
              color: REMOVAL_COLORS[reason],
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full shrink-0"
              style={{ background: REMOVAL_COLORS[reason] }}
            />
            {counts[reason]} {REMOVAL_LABELS[reason].toLowerCase()}
          </span>
        ))}
      </div>
      <p className="mt-2.5 text-[11px] text-neutral-400">
        Click any word to restore · strikethrough = removed
      </p>
    </div>
  );
}
