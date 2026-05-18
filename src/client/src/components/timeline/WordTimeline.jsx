import { useMemo, useRef, useEffect, useState } from 'react';
import { useReviewStore } from '../../store.js';
import { buildSegments } from '../../lib/segments.js';
import { videoRef as globalVideoRef } from '../../lib/videoRef.js';

const PX_PER_SEC   = 8;
const MIN_GAP_SECS = 1;
const BLOCK_H      = 48; // height of the waveform+blocks area
const RULER_H      = 18;
const TOTAL_H      = RULER_H + BLOCK_H;

function tickInterval(dur) {
  if (dur <= 30)   return 5;
  if (dur <= 120)  return 15;
  if (dur <= 300)  return 30;
  if (dur <= 600)  return 60;
  if (dur <= 1800) return 300;
  return 600;
}

function formatTick(s) {
  const m   = Math.floor(s / 60);
  const sec = s % 60;
  if (m === 0) return `${sec}s`;
  return sec === 0 ? `${m}m` : `${m}:${String(sec).padStart(2, '0')}`;
}

function formatTime(s) {
  const m   = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1);
  return `${m}:${sec.padStart(4, '0')}`;
}

// Draw waveform bars, colored green inside word segments and purple in gaps.
function drawWaveform(canvas, waveform, segments, totalDuration) {
  const ctx = canvas.getContext('2d');
  const W   = canvas.width;
  const H   = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const { samples, samplesPerSec } = waveform;
  const cx = H / 2;

  // Precompute a lookup: for each pixel, is it inside a kept segment?
  // Segments are sorted non-overlapping — use a pointer to walk them.
  let si = 0;

  for (let x = 0; x < W; x++) {
    const t = x / PX_PER_SEC;

    // Advance segment pointer
    while (si < segments.length && segments[si].end < t) si++;
    const inSeg = si < segments.length && t >= segments[si].start && t <= segments[si].end;

    // Interpolate amplitude
    const rawIdx = t * samplesPerSec;
    const i0     = Math.floor(rawIdx);
    const frac   = rawIdx - i0;
    const a0     = i0 < samples.length ? samples[i0] : 0;
    const a1     = i0 + 1 < samples.length ? samples[i0 + 1] : 0;
    const amp    = a0 + (a1 - a0) * frac;

    const barH = Math.max(1, amp * H * 0.88);

    if (inSeg) {
      ctx.fillStyle = `rgba(52,211,153,${0.30 + amp * 0.55})`;
    } else {
      ctx.fillStyle = `rgba(168,85,247,${0.22 + amp * 0.45})`;
    }
    ctx.fillRect(x, cx - barH / 2, 1, barH);
  }
}

export function WordTimeline() {
  const timeline      = useReviewStore((s) => s.timeline);
  const maxGapSeconds = useReviewStore((s) => s.maxGapSeconds);
  const waveform      = useReviewStore((s) => s.waveform);
  const scrollToWord  = useReviewStore((s) => s.scrollToWord);

  const scrollRef   = useRef(null);
  const playheadRef = useRef(null);
  const canvasRef   = useRef(null);
  const [hoveredBlock, setHoveredBlock] = useState(null);

  const { segments, gaps, totalDuration } = useMemo(() => {
    const segs = buildSegments(timeline, maxGapSeconds);
    let dur = 0;
    for (let i = timeline.length - 1; i >= 0; i--) {
      if (timeline[i].type === 'word') { dur = timeline[i].end; break; }
    }
    const gapList = [];
    let prev = 0;
    for (const seg of segs) {
      if (seg.start - prev >= MIN_GAP_SECS) gapList.push({ start: prev, end: seg.start });
      prev = seg.end;
    }
    if (dur - prev >= MIN_GAP_SECS) gapList.push({ start: prev, end: dur });
    return { segments: segs, gaps: gapList, totalDuration: dur };
  }, [timeline, maxGapSeconds]);

  // Draw waveform whenever data or segments change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !waveform || !totalDuration) return;
    canvas.width  = Math.ceil(totalDuration * PX_PER_SEC);
    canvas.height = BLOCK_H;
    drawWaveform(canvas, waveform, segments, totalDuration);
  }, [waveform, segments, totalDuration]);

  // Imperative playhead + auto-scroll during playback
  useEffect(() => {
    if (!totalDuration) return;
    const update = () => {
      const video    = globalVideoRef.current;
      const head     = playheadRef.current;
      const scroller = scrollRef.current;
      if (!video || !head || !scroller) return;

      const x = video.currentTime * PX_PER_SEC;
      head.style.left = `${x}px`;

      if (!video.paused) {
        const { scrollLeft, offsetWidth } = scroller;
        if (x < scrollLeft + 40 || x > scrollLeft + offsetWidth - 40) {
          scroller.scrollLeft = x - offsetWidth / 3;
        }
      }
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

  const innerWidth = Math.ceil(totalDuration * PX_PER_SEC);
  const px  = (t) => t * PX_PER_SEC;
  const wpx = (s, e) => Math.max(2, (e - s) * PX_PER_SEC);

  const interval = tickInterval(totalDuration);
  const ticks    = [];
  for (let t = 0; t <= totalDuration; t += interval) ticks.push(t);

  const seek = (time) => {
    if (globalVideoRef.current) globalVideoRef.current.currentTime = time;
  };

  const handleSegmentClick = (seg) => {
    for (let i = 0; i < timeline.length; i++) {
      const item = timeline[i];
      if (item.type === 'word' && Math.abs(item.start - seg.start) < 0.5) {
        scrollToWord(i);
        break;
      }
    }
    seek(seg.start);
  };

  return (
    <div
      ref={scrollRef}
      className="scrollbar-thin shrink-0 overflow-x-auto border-t border-neutral-800 bg-[#111111] select-none"
      style={{ height: TOTAL_H }}
    >
      <div className="relative" style={{ width: innerWidth, height: TOTAL_H, minWidth: '100%' }}>

        {/* Timestamp ruler */}
        <div className="absolute top-0 left-0 right-0 border-b border-white/[0.06]" style={{ height: RULER_H }}>
          {ticks.map((t) => (
            <div
              key={t}
              className="pointer-events-none absolute top-0 flex flex-col items-center"
              style={{ left: px(t), transform: 'translateX(-50%)' }}
            >
              <span className="text-[9px] text-neutral-600 tabular-nums leading-tight pt-[3px]">
                {formatTick(t)}
              </span>
              <div className="absolute bottom-0 w-px bg-white/[0.08]" style={{ height: '4px' }} />
            </div>
          ))}
        </div>

        {/* Blocks + waveform area */}
        <div className="absolute left-0 right-0" style={{ top: RULER_H, height: BLOCK_H }}>

          {/* Waveform canvas — drawn behind the block overlays */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0"
            style={{ width: innerWidth, height: BLOCK_H, imageRendering: 'pixelated' }}
          />

          {/* Purple gap block overlays (border only — waveform fills the color) */}
          {gaps.map((gap, i) => {
            const isHov = hoveredBlock?.type === 'gap' && hoveredBlock.idx === i;
            const dur   = gap.end - gap.start;
            const w     = wpx(gap.start, gap.end);
            return (
              <div
                key={`gap-${i}`}
                className="absolute top-1.5 bottom-1.5 cursor-pointer rounded-sm transition-colors duration-100"
                style={{
                  left:       px(gap.start),
                  width:      w,
                  border:     `1px solid ${isHov ? 'rgba(168,85,247,0.75)' : 'rgba(168,85,247,0.35)'}`,
                  background: isHov ? 'rgba(168,85,247,0.12)' : 'transparent',
                }}
                onClick={() => seek(gap.start)}
                onMouseEnter={() => setHoveredBlock({ type: 'gap', idx: i })}
                onMouseLeave={() => setHoveredBlock(null)}
                title={`${formatTime(gap.start)} – ${formatTime(gap.end)}  (${dur.toFixed(1)}s space)`}
              />
            );
          })}

          {/* Green segment block overlays */}
          {segments.map((seg, i) => {
            const isHov = hoveredBlock?.type === 'seg' && hoveredBlock.idx === i;
            const dur   = seg.end - seg.start;
            const w     = wpx(seg.start, seg.end);
            return (
              <div
                key={`seg-${i}`}
                className="absolute top-1.5 bottom-1.5 cursor-pointer rounded-sm transition-colors duration-100"
                style={{
                  left:       px(seg.start),
                  width:      w,
                  border:     `1px solid ${isHov ? 'rgba(52,211,153,0.75)' : 'rgba(52,211,153,0.35)'}`,
                  background: isHov ? 'rgba(52,211,153,0.12)' : 'transparent',
                }}
                onClick={() => handleSegmentClick(seg)}
                onMouseEnter={() => setHoveredBlock({ type: 'seg', idx: i })}
                onMouseLeave={() => setHoveredBlock(null)}
                title={`${formatTime(seg.start)} – ${formatTime(seg.end)}  (${dur.toFixed(1)}s words)`}
              />
            );
          })}
        </div>

        {/* Full-height playhead */}
        <div
          ref={playheadRef}
          className="pointer-events-none absolute top-0 bottom-0 w-px bg-white/60 z-10"
          style={{ left: 0 }}
        />
      </div>
    </div>
  );
}
