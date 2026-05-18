import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { useReviewStore } from '../../store.js';
import { buildSegments } from '../../lib/segments.js';
import { videoRef as globalVideoRef } from '../../lib/videoRef.js';

const TRACK_H   = 80;
const RULER_H   = 24;
const TOTAL_H   = TRACK_H + RULER_H;
const ZOOM_STEPS = [4, 8, 16, 32, 64, 128]; // px/sec options
const DEFAULT_ZOOM_IDX = 2; // 16px/sec

// ── Waveform canvas ───────────────────────────────────────────────────────

function drawWaveform(canvas, waveform, segments, totalDuration, pxPerSec) {
  const ctx = canvas.getContext('2d');
  const W   = canvas.width;
  const H   = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const cx = H / 2;

  if (waveform) {
    const { samples, samplesPerSec } = waveform;
    let si = 0; // segment pointer

    for (let x = 0; x < W; x++) {
      const t = x / pxPerSec;
      while (si < segments.length && segments[si].end < t) si++;
      const inSeg = si < segments.length && t >= segments[si].start;

      const raw  = t * samplesPerSec;
      const i0   = Math.floor(raw);
      const frac = raw - i0;
      const a0   = i0 < samples.length     ? samples[i0]     : 0;
      const a1   = i0 + 1 < samples.length ? samples[i0 + 1] : 0;
      const amp  = a0 + (a1 - a0) * frac;

      const barH = Math.max(1, amp * H * 0.82);
      ctx.fillStyle = inSeg
        ? `rgba(255,255,255,${(0.45 + amp * 0.50).toFixed(2)})`
        : `rgba(255,255,255,${(0.06 + amp * 0.08).toFixed(2)})`;
      ctx.fillRect(x, cx - barH / 2, 1, barH);
    }
  } else {
    // No waveform — draw a thin center line
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(0, cx - 1, W, 2);
  }

  // Red tint over removed sections
  ctx.fillStyle = 'rgba(220,38,38,0.13)';
  let prev = 0;
  for (const seg of segments) {
    if (seg.start > prev + 0.01)
      ctx.fillRect(prev * pxPerSec, 0, (seg.start - prev) * pxPerSec, H);
    prev = seg.end;
  }
  if (prev < totalDuration - 0.01)
    ctx.fillRect(prev * pxPerSec, 0, (totalDuration - prev) * pxPerSec, H);
}

// ── Ruler ticks ───────────────────────────────────────────────────────────

function tickInterval(pxPerSec) {
  // Pick an interval so ticks are at least ~60px apart
  const secsPerTick = 60 / pxPerSec;
  const candidates  = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  return candidates.find((c) => c >= secsPerTick) ?? 600;
}

function fmtTime(s) {
  const m   = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return m > 0
    ? `${m}:${String(sec).padStart(2, '0')}`
    : `${s % 1 === 0 ? sec : s.toFixed(1)}s`;
}

// ── Component ─────────────────────────────────────────────────────────────

export function EditTimeline() {
  const timeline      = useReviewStore((s) => s.timeline);
  const maxGapSeconds = useReviewStore((s) => s.maxGapSeconds);
  const waveform      = useReviewStore((s) => s.waveform);
  const scrollToWord  = useReviewStore((s) => s.scrollToWord);

  const [zoomIdx, setZoomIdx] = useState(DEFAULT_ZOOM_IDX);
  const pxPerSec = ZOOM_STEPS[zoomIdx];

  const scrollRef   = useRef(null);
  const canvasRef   = useRef(null);
  const playheadRef = useRef(null);
  const isDragging  = useRef(false);

  const { segments, totalDuration } = useMemo(() => {
    const segs = buildSegments(timeline, maxGapSeconds);
    let dur = 0;
    for (let i = timeline.length - 1; i >= 0; i--) {
      if (timeline[i].type === 'word') { dur = timeline[i].end; break; }
    }
    return { segments: segs, totalDuration: dur };
  }, [timeline, maxGapSeconds]);

  const innerW = Math.ceil(totalDuration * pxPerSec);

  // ── Draw waveform canvas ──────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !totalDuration) return;
    canvas.width  = innerW;
    canvas.height = TRACK_H;
    drawWaveform(canvas, waveform, segments, totalDuration, pxPerSec);
  }, [waveform, segments, totalDuration, pxPerSec, innerW]);

  // ── Imperative playhead + auto-scroll ────────────────────────────────
  useEffect(() => {
    if (!totalDuration) return;
    const update = () => {
      const video    = globalVideoRef.current;
      const head     = playheadRef.current;
      const scroller = scrollRef.current;
      if (!video || !head || !scroller || isDragging.current) return;

      const x = video.currentTime * pxPerSec;
      head.style.left = `${x}px`;

      if (!video.paused) {
        const { scrollLeft, offsetWidth } = scroller;
        if (x < scrollLeft + 60 || x > scrollLeft + offsetWidth - 60)
          scroller.scrollLeft = x - offsetWidth * 0.35;
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
  }, [totalDuration, pxPerSec]);

  // ── Seek on track click ───────────────────────────────────────────────
  const handleTrackClick = useCallback((e) => {
    if (isDragging.current) return;
    const scroller = scrollRef.current;
    if (!scroller) return;
    const rect = scroller.getBoundingClientRect();
    const x    = e.clientX - rect.left + scroller.scrollLeft;
    const t    = Math.max(0, Math.min(totalDuration, x / pxPerSec));

    if (globalVideoRef.current) globalVideoRef.current.currentTime = t;

    // Scroll transcript to nearest word
    for (let i = 0; i < timeline.length; i++) {
      const item = timeline[i];
      if (item.type === 'word' && !item.removed && item.end >= t) {
        scrollToWord(i); break;
      }
    }
  }, [totalDuration, pxPerSec, timeline, scrollToWord]);

  // ── Draggable playhead ────────────────────────────────────────────────
  const handlePlayheadMouseDown = useCallback((e) => {
    e.stopPropagation();
    isDragging.current = true;
    const startClientX = e.clientX;
    const startTime    = globalVideoRef.current?.currentTime ?? 0;

    const onMove = (ev) => {
      const dx = ev.clientX - startClientX;
      const t  = Math.max(0, Math.min(totalDuration, startTime + dx / pxPerSec));
      if (globalVideoRef.current) globalVideoRef.current.currentTime = t;
      if (playheadRef.current) playheadRef.current.style.left = `${t * pxPerSec}px`;
    };
    const onUp = () => {
      isDragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
  }, [totalDuration, pxPerSec]);

  if (!totalDuration) return null;

  const interval = tickInterval(pxPerSec);
  const ticks    = [];
  for (let t = 0; t <= totalDuration; t += interval) ticks.push(t);

  return (
    <div
      className="shrink-0 border-t border-neutral-800 bg-[#0c0c0c] select-none"
      style={{ height: TOTAL_H }}
    >
      {/* Zoom controls — float over top-right */}
      <div className="absolute right-3 z-20 flex items-center gap-1" style={{ marginTop: 3 }}>
        <button
          className="flex items-center justify-center rounded bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white transition-colors"
          style={{ width: 22, height: 22 }}
          onClick={() => setZoomIdx((i) => Math.max(0, i - 1))}
          title="Zoom out"
        >
          <ZoomOut size={12} />
        </button>
        <span className="text-[10px] text-neutral-600 tabular-nums w-8 text-center">
          {pxPerSec}px/s
        </span>
        <button
          className="flex items-center justify-center rounded bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white transition-colors"
          style={{ width: 22, height: 22 }}
          onClick={() => setZoomIdx((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))}
          title="Zoom in"
        >
          <ZoomIn size={12} />
        </button>
      </div>

      {/* Scrollable area */}
      <div
        ref={scrollRef}
        className="scrollbar-thin h-full overflow-x-auto overflow-y-hidden"
        onClick={handleTrackClick}
      >
        <div className="relative" style={{ width: Math.max(innerW, 1), height: TOTAL_H, minWidth: '100%' }}>

          {/* ── Ruler ── */}
          <div
            className="absolute top-0 left-0 right-0 bg-[#131313] border-b border-neutral-800"
            style={{ height: RULER_H }}
          >
            {ticks.map((t) => (
              <div
                key={t}
                className="absolute top-0 h-full pointer-events-none"
                style={{ left: t * pxPerSec }}
              >
                <div className="absolute bottom-0 w-px bg-neutral-700" style={{ height: 6 }} />
                <span
                  className="absolute text-[10px] text-neutral-500 tabular-nums"
                  style={{ top: 5, left: 4 }}
                >
                  {fmtTime(t)}
                </span>
              </div>
            ))}
          </div>

          {/* ── Waveform track ── */}
          <div
            className="absolute left-0 right-0"
            style={{ top: RULER_H, height: TRACK_H }}
          >
            <canvas
              ref={canvasRef}
              className="absolute inset-0"
              style={{ width: innerW, height: TRACK_H, imageRendering: 'pixelated' }}
            />

            {/* Segment labels — show start time of each kept segment */}
            {segments.map((seg, i) => {
              const w = (seg.end - seg.start) * pxPerSec;
              if (w < 30) return null;
              return (
                <div
                  key={i}
                  className="pointer-events-none absolute top-1 text-[9px] text-white/30 tabular-nums px-1"
                  style={{ left: seg.start * pxPerSec }}
                >
                  {fmtTime(seg.start)}
                </div>
              );
            })}
          </div>

          {/* ── Playhead ── */}
          <div
            ref={playheadRef}
            className="absolute top-0 bottom-0 z-10 pointer-events-none"
            style={{ left: 0, width: 1 }}
          >
            {/* Draggable handle */}
            <div
              className="absolute cursor-ew-resize pointer-events-auto"
              style={{ top: 0, left: -5, width: 11, height: RULER_H }}
              onMouseDown={handlePlayheadMouseDown}
            >
              {/* Triangle handle */}
              <div
                className="absolute left-1/2 -translate-x-1/2 bg-white"
                style={{
                  top: 0,
                  width: 2,
                  height: RULER_H,
                  boxShadow: '0 0 4px rgba(255,255,255,0.6)',
                }}
              />
              <div
                className="absolute left-1/2 -translate-x-1/2"
                style={{
                  top: 0,
                  width: 0,
                  height: 0,
                  borderLeft: '5px solid transparent',
                  borderRight: '5px solid transparent',
                  borderTop: '7px solid white',
                  transform: 'translateX(-50%)',
                }}
              />
            </div>
            {/* Full-height line */}
            <div
              className="absolute top-0 bottom-0 w-px bg-white/70"
              style={{ left: 0, boxShadow: '0 0 3px rgba(255,255,255,0.4)' }}
            />
          </div>

        </div>
      </div>
    </div>
  );
}
