import { useReviewStore } from '../../store.js';
import { ResetButton }   from './ResetButton.jsx';
import { UndoButton }    from './UndoButton.jsx';
import { ApproveButton } from './ApproveButton.jsx';

export function Toolbar() {
  const status       = useReviewStore((s) => s.status);
  const errorMessage = useReviewStore((s) => s.errorMessage);

  return (
    <footer className="flex h-11 shrink-0 items-center gap-2 border-t border-white/[0.05] bg-[#0a0a0a] px-4">
      {status === 'exported' && (
        <span className="text-xs font-medium text-emerald-400">
          Export started — you can close this tab
        </span>
      )}
      {errorMessage && status === 'ready' && (
        <span className="max-w-xs truncate text-xs text-red-400" title={errorMessage}>
          {errorMessage}
        </span>
      )}

      <div className="flex-1" />

      <ResetButton />
      <UndoButton />
      <ApproveButton />
    </footer>
  );
}
