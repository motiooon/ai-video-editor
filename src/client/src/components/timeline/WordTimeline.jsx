import { useMemo, useRef, useEffect, useState } from 'react';
import { useReviewStore } from '../../store.js';
import { buildSegments } from '../../lib/segments.js';
import { videoRef as globalVideoRef } from '../../lib/videoRef.js';

function tickInterval(dur) {
  if (dur <= 30)   return 5;
  if (dur <= 120)  return 15;
  if (dur <= 300)  return 30;
  if (dur <= 600)  return 60;
  if (dur <= 1800) return 300;
  return 600;
}

function formatTick(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m === 0) return `${sec}s`;
  return sec === 0 ? `${m}m` : `${m}:${String(sec).padStart(2, '0')}`;
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1);
  return `${m}:${sec.padStart(4, '0')}`;
}

export function WordTimeline() {
  const timeline        = useReviewStore((s) => s.timeline);
  const maxGapSeconds   = useReviewStore((s) => s.maxGapSeconds);
  const toggleSegment   = useReviewStore((s) => s.toggleSegment);
  const scrollToWord    = useReviewStore((s) => s.scrollToWord);

  const playheadRef = useRef(null);
  const [hoveredIdx, setHoveredIdx] = useState(-1);

  const { segments, totalDuration } = useMemo(() => {
    const segs = buildSegments(timeline, maxGapSeconds);
    let dur = 0;
    for (let i = timeline.length - 1; i >= 0; i--) {
      if (timeline[i].type === 'word') { dur = timeline[i].end; break; }
    }
    return { segments: segs, totalDuration: dur };
  }, [timeline, maxGapSeconds]);

  // Imperative playhead — no re-render on every frame
  useEffect(() => {
    if (!totalDuration) return;
    const update = () => {
      const video = globalVideoRef.current;
      if (!video || !playheadRef.current) return;
      playheadRef.current.style.left =
        `${Math.min(100, (video.currentTime / totalDuration) * 100)}%`;
    };
    const attach = () => {
      const video = globalVideoRef.current;
      if (!video) { setTimeout(attach, 100); return; }
      video.addEventListener('timeupdate',     update);
      video.addEventListener('loadedmetadata', update);
      update();
    };
    attach();
    return () => {
      const video = globalVideoRef.current;
      video?.removeEventListener('timeupdate',     update);
      video?.removeEventListener('loadedmetadata', update);
    };
  }, [totalDuration]);

  if (!totalDuration) return null;

  const pct  = (t) => `${(t / totalDuration) * 100}%`;
  const wpct = (s, e) => `${Math.max(0.15, ((e - s) / totalDuration) * 100)}%`;

  const interval = tickInterval(totalDuration);
  const ticks = [];
  for (let t = interval; t < totalDuration; t += interval) ticks.push(t);

  const handleSegmentClick = (seg) => {
    for (let i = 0; i < timeline.length; i++) {
      const item = timeline[i];
      if (item.type === 'word' && Math.abs(item.start - seg.start) < 0.5) {
        scrollToWord(i);
        break;
      }
    }
    toggleSegment(seg.start, seg.end);
    if (globalVideoRef.current) globalVideoRef.current.currentTime = seg.start;
  };

  const handleBackgroundClick = (e) => {
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const time = ((e.clientX - rect.left) / rect.width) * totalDuration;
    if (globalVideoRef.current) globalVideoRef.current.currentTime = time;
  };

  return (
    <div
      className="relative shrink-0 border-t border-neutral-800 bg-[#111111] select-none"
      style={{ height: 56 }}
    >
      {/* Timestamp ruler */}
      <div className="relative border-b border-white/[0.06]" style={{ height: 18 }}>
        {ticks.map((t) => (
          <div
            key={t}
            className="pointer-events-none absolute top-0 flex flex-col items-center"
            style={{ left: pct(t), transform: 'translateX(-50%)' }}
          >
            <span className="text-[9px] text-neutral-600 tabular-nums leading-tight pt-[3px]">
              {formatTick(t)}
            </span>
          </div>
        ))}
        {ticks.map((t) => (
          <div
            key={`tk-${t}`}
            className="pointer-events-none absolute bottom-0 w-px bg-white/[0.08]"
            style={{ left: pct(t), height: '4px' }}
          />
        ))}
      </div>

      {/* Segments area */}
      <div
        className="relative cursor-crosshair"
        style={{ height: 38 }}
        onClick={handleBackgroundClick}
      >
        {segments.map((seg, i) => {
          const isHovered = hoveredIdx === i;
          const dur = seg.end - seg.start;
          const showLabel = dur / totalDuration > 0.04;

          return (
            <div
              key={i}
              className="absolute top-2 bottom-2 cursor-pointer rounded-sm transition-all duration-100"
              style={{
                left:    pct(seg.start),
                width:   wpct(seg.start, seg.end),
                background: isHovered
                  ? 'rgba(52,211,153,0.50)'
                  : 'rgba(52,211,153,0.25)',
                border: `1px solid ${isHovered ? 'rgba(52,211,153,0.80)' : 'rgba(52,211,153,0.40)'}`,
              }}
              onClick={(e) => { e.stopPropagation(); handleSegmentClick(seg); }}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(-1)}
              title={`${formatTime(seg.start)} – ${formatTime(seg.end)}  (${dur.toFixed(1)}s)\nClick to remove`}
            >
              {showLabel && (
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[9px] font-medium text-emerald-300/70 overflow-hidden whitespace-nowrap">
                  {dur.toFixed(1)}s
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Full-height playhead spanning ruler + segments */}
      <div
        ref={playheadRef}
        className="pointer-events-none absolute top-0 bottom-0 w-px bg-white/50 z-10"
        style={{ left: '0%' }}
      />
    </div>
  );
}
