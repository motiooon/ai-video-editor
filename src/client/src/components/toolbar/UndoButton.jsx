import { Undo2 } from 'lucide-react';
import { useReviewStore } from '../../store.js';
import { Button, Badge } from '../common/index.js';

export function UndoButton() {
  const undo    = useReviewStore((s) => s.undo);
  const history = useReviewStore((s) => s.history);
  const status  = useReviewStore((s) => s.status);

  return (
    <Button
      variant="ghost"
      size="sm"
      icon={<Undo2 size={13} />}
      onClick={undo}
      disabled={history.length === 0 || status === 'exporting' || status === 'exported'}
      title={`Undo (${history.length} changes)`}
    >
      Undo
      <Badge count={history.length} />
    </Button>
  );
}
