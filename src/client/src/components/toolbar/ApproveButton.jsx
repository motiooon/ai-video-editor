import { CheckCircle } from 'lucide-react';
import { useReviewStore } from '../../store.js';
import { Button } from '../common/index.js';

export function ApproveButton() {
  const approve = useReviewStore((s) => s.approve);
  const status  = useReviewStore((s) => s.status);

  const isExporting = status === 'exporting';
  const isExported  = status === 'exported';

  return (
    <Button
      variant="primary"
      size="sm"
      onClick={approve}
      disabled={isExporting || isExported}
      loading={isExporting}
      icon={isExported ? <CheckCircle size={14} /> : null}
    >
      {isExporting ? 'Exporting…' : isExported ? 'Exported' : 'Approve & Export'}
    </Button>
  );
}
