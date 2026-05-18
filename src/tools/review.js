import path from 'path';
import { getSession } from './session.js';
import { createReview } from '../server.js';

export const tools = [
  {
    name: 'open_review',
    description: 'Open the review UI in the browser. Blocks until the user approves the edit. Returns once the user clicks "Approve & Export".',
    input_schema: {
      type: 'object',
      properties: { session_id: { type: 'string' } },
      required: ['session_id'],
    },
    async fn({ session_id }, { onReady } = {}) {
      const s = getSession(session_id);
      if (!s.timeline) throw new Error('Call build_timeline first');

      const maxGap = s.config.maxGapSeconds ?? 0.3;
      s.approvedTimeline = await createReview(
        path.basename(s.filePath), s.filePath, s.proxyPath, s.timeline, maxGap, onReady,
      );
      return { approved: true };
    },
  },
];
