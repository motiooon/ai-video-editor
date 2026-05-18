import { Dot } from '../common/index.js';
import { REMOVAL_COLORS, REMOVAL_LABELS } from '../../theme/index.js';

const REASON_ORDER = ['filler', 'duplicate', 'false-start', 'redundant', 'too-short', 'ai-clarity', 'user'];

export function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-neutral-400">
      {REASON_ORDER.map((reason) => (
        <span key={reason} className="flex items-center gap-1.5">
          <Dot color={REMOVAL_COLORS[reason]} />
          {REMOVAL_LABELS[reason]}
        </span>
      ))}

      <span className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-4 shrink-0 rounded-sm bg-emerald-500/30 ring-1 ring-emerald-500/40" />
        Kept silence
      </span>

      <span className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-4 shrink-0 rounded-sm bg-red-500/20 ring-1 ring-red-500/30" />
        Cut silence
      </span>

      <span className="text-neutral-600">· Click anything to toggle</span>
    </div>
  );
}
