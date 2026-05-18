import { getSession } from './session.js';

function annotate(words, config) {
  const {
    removeDuplicateWords = true,
    removeFillerWords    = true,
    fillerWords          = [],
    minSegmentSeconds    = 0.05,
  } = config;

  const fillerSet = new Set(fillerWords.map((f) => f.toLowerCase()));

  return words.map((w, i) => {
    const lower = w.word.toLowerCase().replace(/[^a-z']/g, '');
    if (w.end - w.start < minSegmentSeconds) return { ...w, removed: true, reason: 'too-short' };
    if (removeFillerWords && fillerSet.has(lower))  return { ...w, removed: true, reason: 'filler' };
    if (removeDuplicateWords && i > 0) {
      const prevLower = words[i - 1].word.toLowerCase().replace(/[^a-z']/g, '');
      if (lower === prevLower) return { ...w, removed: true, reason: 'duplicate' };
    }
    return { ...w, removed: false, reason: null };
  });
}

export const tools = [
  {
    name: 'apply_rules',
    description: 'Automatically mark filler words, consecutive duplicates, and too-short segments using config-defined rules. Optional — Claude can handle all annotation via get_transcript + mark_removed instead.',
    input_schema: {
      type: 'object',
      properties: { session_id: { type: 'string' } },
      required: ['session_id'],
    },
    async fn({ session_id }) {
      const s = getSession(session_id);
      if (!s.words) throw new Error('Call transcribe first');
      s.annotatedWords = annotate(s.words, s.config);
      const removed = s.annotatedWords.filter((w) => w.removed);
      const byReason = {};
      for (const w of removed) byReason[w.reason] = (byReason[w.reason] || 0) + 1;
      return { total_removed: removed.length, by_reason: byReason };
    },
  },
  {
    name: 'get_transcript',
    description: 'Return the full numbered transcript with per-word duration and removal status. Read this to make editorial decisions before calling mark_removed.',
    input_schema: {
      type: 'object',
      properties: { session_id: { type: 'string' } },
      required: ['session_id'],
    },
    async fn({ session_id }) {
      const s = getSession(session_id);
      const words = s.annotatedWords ?? s.words;
      if (!words) throw new Error('Call transcribe first');
      const lines = words.map((w, i) => {
        const dur = Math.round((w.end - w.start) * 1000);
        const tag = w.removed ? `[removed:${w.reason}]` : `[${dur}ms]`;
        return `${i}: ${w.word} ${tag}`;
      });
      return { transcript: lines.join('\n'), total_words: words.length };
    },
  },
  {
    name: 'mark_removed',
    description: 'Mark specific word indices for removal. Use the most specific reason — it controls the highlight colour in the review UI.',
    input_schema: {
      type: 'object',
      properties: {
        session_id: { type: 'string' },
        indices: {
          type: 'array', items: { type: 'integer' },
          description: 'Zero-based word indices to mark as removed',
        },
        reason: {
          type: 'string',
          enum: ['filler', 'duplicate', 'false-start', 'redundant', 'too-short', 'ai-clarity'],
          description: 'Why these words are being removed',
        },
      },
      required: ['session_id', 'indices'],
    },
    async fn({ session_id, indices, reason = 'ai-clarity' }) {
      const s = getSession(session_id);
      if (!s.words) throw new Error('Call transcribe first');
      if (!s.annotatedWords) {
        s.annotatedWords = s.words.map((w) => ({ ...w, removed: false, reason: null }));
      }
      let count = 0;
      for (const i of indices) {
        if (i >= 0 && i < s.annotatedWords.length && !s.annotatedWords[i].removed) {
          s.annotatedWords[i] = { ...s.annotatedWords[i], removed: true, reason };
          count++;
        }
      }
      return { marked: count };
    },
  },
  {
    name: 'mark_kept',
    description: 'Restore previously-removed words back to kept.',
    input_schema: {
      type: 'object',
      properties: {
        session_id: { type: 'string' },
        indices: { type: 'array', items: { type: 'integer' } },
      },
      required: ['session_id', 'indices'],
    },
    async fn({ session_id, indices }) {
      const s = getSession(session_id);
      if (!s.annotatedWords) throw new Error('Call get_transcript first');
      let count = 0;
      for (const i of indices) {
        if (i >= 0 && i < s.annotatedWords.length && s.annotatedWords[i].removed) {
          s.annotatedWords[i] = { ...s.annotatedWords[i], removed: false, reason: null };
          count++;
        }
      }
      return { restored: count };
    },
  },
];
