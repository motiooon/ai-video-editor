import { getSession } from './session.js';

function buildTimeline(annotatedWords, maxGapSeconds = 0.3) {
  const items = [];
  for (let i = 0; i < annotatedWords.length; i++) {
    items.push({ type: 'word', ...annotatedWords[i] });
    if (i < annotatedWords.length - 1) {
      const gapStart = annotatedWords[i].end;
      const gapEnd   = annotatedWords[i + 1].start;
      const duration = gapEnd - gapStart;
      if (duration >= 0.01) {
        items.push({
          type: 'gap', start: gapStart, end: gapEnd,
          duration: Math.round(duration * 100) / 100,
          removed: duration > maxGapSeconds,
        });
      }
    }
  }
  return items;
}

export const tools = [
  {
    name: 'build_timeline',
    description: 'Build the final edit timeline from annotated words, interleaving gap blocks. Call this after all mark_removed / mark_kept calls.',
    input_schema: {
      type: 'object',
      properties: { session_id: { type: 'string' } },
      required: ['session_id'],
    },
    async fn({ session_id }) {
      const s = getSession(session_id);
      if (!s.annotatedWords) throw new Error('Call get_transcript / mark_removed first');

      const maxGap = s.config.maxGapSeconds ?? 0.3;
      s.timeline = buildTimeline(s.annotatedWords, maxGap);

      const removedWords = s.annotatedWords.filter((w) => w.removed).length;
      const removedGaps  = s.timeline.filter((i) => i.type === 'gap' && i.removed).length;
      return { total_items: s.timeline.length, removed_words: removedWords, removed_gaps: removedGaps };
    },
  },
];
