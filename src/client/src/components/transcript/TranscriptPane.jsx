import { useRef, useEffect } from 'react';
import { useReviewStore } from '../../store.js';
import { findAdjacentWord } from '../../lib/segments.js';
import { WordChip } from './WordChip.jsx';
import { GapChip } from './GapChip.jsx';
import { AiSummary } from './AiSummary.jsx';

export function TranscriptPane() {
  const timeline        = useReviewStore((s) => s.timeline);
  const activeWordIndex = useReviewStore((s) => s.activeWordIndex);
  const wordRefs        = useRef({});
  const containerRef    = useRef(null);

  useEffect(() => {
    if (activeWordIndex < 0) return;
    const el        = wordRefs.current[activeWordIndex];
    const container = containerRef.current;
    if (!el || !container) return;

    const elTop    = el.offsetTop;
    const elBottom = elTop + el.offsetHeight;
    const viewTop  = container.scrollTop;
    const viewBot  = viewTop + container.offsetHeight;

    if (elTop < viewTop + 80 || elBottom > viewBot - 80) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [activeWordIndex]);

  const nodes = [];

  for (let i = 0; i < timeline.length; i++) {
    const item = timeline[i];

    if (item.type === 'word') {
      nodes.push(
        <WordChip
          key={i}
          item={item}
          index={i}
          isActive={i === activeWordIndex}
          ref={(el) => {
            if (el) wordRefs.current[i] = el;
            else    delete wordRefs.current[i];
          }}
        />
      );
      nodes.push(' ');
    } else if (item.type === 'gap') {
      const prev = findAdjacentWord(timeline, i, -1);
      const next = findAdjacentWord(timeline, i,  1);
      if (!prev?.removed && !next?.removed) {
        nodes.push(<GapChip key={i} item={item} index={i} />);
      }
    }
  }

  return (
    <div
      ref={containerRef}
      className="scrollbar-light h-full overflow-y-auto bg-[#fafafa] px-9 py-8"
    >
      <AiSummary />
      <p className="leading-[2.5] text-[#141414]" style={{ fontSize: '17px' }}>
        {nodes}
      </p>
    </div>
  );
}
