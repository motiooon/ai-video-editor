import { create } from 'zustand';
import { buildSegments } from './lib/segments.js';

const MAX_HISTORY = 50;

function getReviewId() {
  const match = window.location.pathname.match(/\/review\/([^/]+)/);
  return match ? match[1] : null;
}

export const useReviewStore = create((set, get) => ({
  reviewId: getReviewId(),
  filename: '',
  timeline: [],
  originalTimeline: [],
  maxGapSeconds: 0.3,
  waveform: null,
  activeWordIndex: -1,
  isPreviewing: false,
  currentSegIdx: 0,
  status: 'loading',
  errorMessage: '',
  history: [],

  load: async () => {
    const { reviewId } = get();
    if (!reviewId) {
      set({ status: 'error', errorMessage: 'No review ID found in URL.' });
      return;
    }
    try {
      const res = await fetch(`/review/${reviewId}/data`);
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      set({
        filename: data.filename ?? '',
        timeline: data.timeline ?? [],
        originalTimeline: JSON.parse(JSON.stringify(data.timeline ?? [])),
        maxGapSeconds: data.maxGapSeconds ?? 0.3,
        waveform: data.waveform ?? null,
        status: 'ready',
        history: [],
      });
    } catch (err) {
      set({ status: 'error', errorMessage: err.message });
    }
  },

  toggleItem: (i) => {
    const { timeline, history } = get();
    const next = timeline.map((item, idx) => {
      if (idx !== i) return item;
      if (item.type === 'word') {
        return { ...item, removed: !item.removed, reason: item.removed ? null : 'user' };
      }
      if (item.type === 'gap') {
        return { ...item, removed: !item.removed };
      }
      return item;
    });
    set({
      timeline: next,
      history: [...history.slice(-MAX_HISTORY + 1), timeline],
    });
  },

  // Adjust which words are kept when the user drags a segment edge.
  // Words newly inside [newStart,newEnd] are restored; words that fell outside are removed.
  resizeSegment: (oldStart, oldEnd, newStart, newEnd) => {
    const { timeline, history } = get();
    const EPS = 0.05;
    const next = timeline.map((item) => {
      if (item.type !== 'word') return item;
      const wasIn = item.start >= oldStart - EPS && item.end <= oldEnd + EPS;
      const isIn  = item.start >= newStart - EPS && item.end <= newEnd + EPS;
      if (wasIn && !isIn) return { ...item, removed: true,  reason: 'user' };
      if (!wasIn && isIn) return { ...item, removed: false, reason: null  };
      return item;
    });
    set({ timeline: next, history: [...history.slice(-MAX_HISTORY + 1), timeline] });
  },

  // Toggle every word inside a segment's time range.
  // If any word is kept → remove all. If all removed → restore all.
  toggleSegment: (segStart, segEnd) => {
    const { timeline, history } = get();
    const inRange = (item) =>
      item.type === 'word' &&
      item.start >= segStart - 0.001 &&
      item.end   <= segEnd   + 0.001;

    const anyKept = timeline.some((item) => inRange(item) && !item.removed);
    const next = timeline.map((item) => {
      if (!inRange(item)) return item;
      return anyKept
        ? { ...item, removed: true,  reason: 'user' }
        : { ...item, removed: false, reason: null };
    });
    set({ timeline: next, history: [...history.slice(-MAX_HISTORY + 1), timeline] });
  },

  // Scroll the transcript to a specific timeline index (works for removed words too).
  scrollToWord: (timelineIndex) => {
    set({ activeWordIndex: timelineIndex });
  },

  undo: () => {
    const { history } = get();
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    set({
      timeline: prev,
      history: history.slice(0, -1),
    });
  },

  reset: () => {
    const { originalTimeline } = get();
    set({
      timeline: JSON.parse(JSON.stringify(originalTimeline)),
      history: [],
      activeWordIndex: -1,
      isPreviewing: false,
      currentSegIdx: 0,
    });
  },

  setActiveWord: (currentTime) => {
    const { timeline } = get();
    let found = -1;
    for (let i = 0; i < timeline.length; i++) {
      const item = timeline[i];
      if (item.type === 'word' && !item.removed) {
        if (currentTime >= item.start && currentTime <= item.end) {
          found = i;
          break;
        }
      }
    }
    const { activeWordIndex } = get();
    if (found !== activeWordIndex) {
      set({ activeWordIndex: found });
    }
  },

  startPreview: () => {
    const { timeline, maxGapSeconds } = get();
    const segs = buildSegments(timeline, maxGapSeconds).filter((s) => s.end > s.start);
    if (segs.length === 0) return null;
    set({ isPreviewing: true, currentSegIdx: 0 });
    return segs[0].start;
  },

  stopPreview: () => {
    set({ isPreviewing: false, currentSegIdx: 0 });
  },

  // Recomputed every tick — any transcript edit is reflected immediately.
  // Strategy: if currentTime is inside a segment, keep playing.
  //           if currentTime is in a gap (past a segment end), jump now.
  advancePreview: (currentTime) => {
    const { isPreviewing, timeline, maxGapSeconds } = get();
    if (!isPreviewing) return null;

    const segs = buildSegments(timeline, maxGapSeconds).filter((s) => s.end > s.start);
    if (!segs.length) { set({ isPreviewing: false, currentSegIdx: 0 }); return 'done'; }

    for (let i = 0; i < segs.length; i++) {
      if (currentTime < segs[i].start) {
        // We're in a gap before this segment — jump to it immediately
        set({ currentSegIdx: i });
        return segs[i].start;
      }
      if (currentTime <= segs[i].end) {
        // Inside this segment — keep playing
        set({ currentSegIdx: i });
        return null;
      }
    }

    // Past the last segment
    set({ isPreviewing: false, currentSegIdx: 0 });
    return 'done';
  },

  approve: async () => {
    const { reviewId, timeline } = get();
    set({ status: 'exporting', errorMessage: '' });
    try {
      const res = await fetch(`/review/${reviewId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeline }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Export failed (${res.status}): ${text}`);
      }
      set({ status: 'exported' });
    } catch (err) {
      set({ status: 'ready', errorMessage: err.message });
    }
  },
}));
