import { RotateCcw } from 'lucide-react';
import { useReviewStore } from '../../store.js';
import { Button } from '../common/index.js';

export function ResetButton() {
  const reset  = useReviewStore((s) => s.reset);
  const status = useReviewStore((s) => s.status);

  return (
    <Button
      variant="ghost"
      size="sm"
      icon={<RotateCcw size={13} />}
      onClick={reset}
      disabled={status === 'exporting' || status === 'exported'}
    >
      Reset
    </Button>
  );
}
