/**
 * Build playback segments from a timeline.
 * Mirrors the server-side logic in editor.js exactly.
 *
 * A segment is { start, end } in seconds of the original video.
 * Removed words break the current segment.
 * Removed gaps are shortened to maxGapSeconds on each side.
 * Kept gaps extend the current segment.
 */
export function buildSegments(timeline, maxGapSeconds = 0.3) {
  const segments = [];
  let seg = null;

  const pushSeg = () => {
    if (seg && seg.end > seg.start) {
      segments.push({ ...seg });
    }
    seg = null;
  };

  for (let i = 0; i < timeline.length; i++) {
    const item = timeline[i];

    if (item.type === 'word') {
      if (item.removed) {
        pushSeg();
      } else {
        if (!seg) {
          seg = { start: item.start, end: item.end };
        } else {
          seg.end = item.end;
        }
      }
    } else if (item.type === 'gap') {
      if (item.removed) {
        // Pad each side by maxGapSeconds then push the current seg
        if (seg) {
          seg.end = Math.min(item.end, seg.end + maxGapSeconds);
          pushSeg();
          // Start new seg padded from gap end
          const newStart = Math.max(item.start, item.end - maxGapSeconds);
          seg = { start: newStart, end: item.end };
        }
      } else {
        // Kept gap: extend current segment
        if (seg) {
          seg.end = item.end;
        }
      }
    }
  }

  pushSeg();

  return segments;
}

/**
 * Walk left (dir === -1) or right (dir === 1) from gapIdx
 * to find the nearest word item. Returns the item or null.
 */
export function findAdjacentWord(timeline, gapIdx, dir) {
  let i = gapIdx + dir;
  while (i >= 0 && i < timeline.length) {
    if (timeline[i].type === 'word') {
      return timeline[i];
    }
    i += dir;
  }
  return null;
}

/**
 * Build summary statistics for the current timeline state.
 */
export function buildStats(timeline, segments) {
  let wordsKept = 0;
  let wordsRemoved = 0;
  let silencesCut = 0;

  for (const item of timeline) {
    if (item.type === 'word') {
      if (item.removed) {
        wordsRemoved++;
      } else {
        wordsKept++;
      }
    } else if (item.type === 'gap') {
      if (item.removed) {
        silencesCut++;
      }
    }
  }

  const outputSeconds = segments.reduce((acc, seg) => acc + (seg.end - seg.start), 0);

  return { wordsKept, wordsRemoved, silencesCut, outputSeconds };
}
