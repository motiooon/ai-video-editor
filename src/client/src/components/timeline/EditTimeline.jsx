import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { useReviewStore } from '../../store.js';
import { buildSegments } from '../../lib/segments.js';
import { videoRef as globalVideoRef } from '../../lib/videoRef.js';

const PX_DEF  = 80;
const PX_MIN  = 20;
const PX_MAX  = 400;
const RULER_H = 20;
const TRACK_H = 32;
const MIN_H   = 6 + RULER_H + TRACK_H * 2; // equal space above & below track
const MAX_H   = 500;
const EDGE_ZONE   = 6;
const MIN_GAP_VIS = 0;

// ── Helpers ───────────────────────────────────────────────────────────────

function tickInterval(pps) {
  // aim for ~80px between ticks regardless of zoom
  const secPerTick = 80 / pps;
  const candidates = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  return candidates.find((c) => c >= secPerTick) ?? 600;
}

function fmtTick(s) {
  const m   = Math.floor(s / 60);
  const sec = s % 60;
  if (m === 0) return `${sec}s`;
  return sec === 0 ? `${m}m` : `${m}:${String(sec).padStart(2, '0')}`;
}

function drawWaveform(canvas, waveform, segments, gaps, pps) {
  const ctx = canvas.getContext('2d');
  const W   = canvas.width;
  const H   = canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (!waveform) return;

  const { samples, samplesPerSec } = waveform;
  const cx = H / 2;
  let si = 0;
  let gi = 0;

  for (let x = 0; x < W; x++) {
    const t = x / pps;

    while (si < segments.length && segments[si].end < t) si++;
    const inSeg = si < segments.length && t >= segments[si].start && t <= segments[si].end;

    // Only paint purple for real gaps (>= MIN_GAP_VIS), not micro-gaps between words
    while (gi < gaps.length && gaps[gi].end < t) gi++;
    const inGap = !inSeg && gi < gaps.length && t >= gaps[gi].start && t <= gaps[gi].end;

    const rawIdx = t * samplesPerSec;
    const i0     = Math.floor(rawIdx);
    const frac   = rawIdx - i0;
    const a0     = i0     < samples.length ? samples[i0]     : 0;
    const a1     = i0 + 1 < samples.length ? samples[i0 + 1] : 0;
    const amp    = a0 + (a1 - a0) * frac;
    const barH   = Math.max(1, amp * H * 0.88);

    if (inSeg) {
      // Minimum bar = 15% of height so silence still shows as a thin line
      const h = Math.max(H * 0.15, barH);
      ctx.fillStyle = `rgba(52,211,153,${0.40 + amp * 0.55})`;
      ctx.fillRect(x, cx - h / 2, 1, h);
    } else if (inGap) {
      ctx.fillStyle = `rgba(168,85,247,${0.40 + amp * 0.55})`;
      ctx.fillRect(x, cx - barH / 2, 1, barH);
    }
  }
}

// ── Main component ────────────────────────────────────────────────────────

export function EditTimeline() {
  const timeline      = useReviewStore((s) => s.timeline);
  const maxGapSeconds = useReviewStore((s) => s.maxGapSeconds);
  const waveform      = useReviewStore((s) => s.waveform);
  const scrollToWord  = useReviewStore((s) => s.scrollToWord);
  const toggleSegment = useReviewStore((s) => s.toggleSegment);
  const resizeSegment = useReviewStore((s) => s.resizeSegment);

  const scrollRef   = useRef(null);
  const canvasRef   = useRef(null);
  const playheadRef = useRef(null);
  const panelRef    = useRef(null);
  const dragState   = useRef(null);
  const panelDrag   = useRef(false);
  const ppsRef      = useRef(PX_DEF);

  const [panelH, setPanelH] = useState(MIN_H);
  const [pps,    setPps]    = useState(PX_DEF);
  const [hoverX, setHoverX] = useState(null);

  const { segments, totalDuration } = useMemo(() => {
    const segs = buildSegments(timeline, maxGapSeconds);
    let dur = 0;
    for (let i = timeline.length - 1; i >= 0; i--) {
      if (timeline[i].type === 'word') { dur = timeline[i].end; break; }
    }
    return { segments: segs, totalDuration: dur };
  }, [timeline, maxGapSeconds]);

  const gaps = useMemo(() => {
    const list = [];
    let prev = 0;
    for (const seg of segments) {
      if (seg.start - prev >= MIN_GAP_VIS) list.push({ start: prev, end: seg.start });
      prev = seg.end;
    }
    if (totalDuration - prev >= MIN_GAP_VIS) list.push({ start: prev, end: totalDuration });
    return list;
  }, [segments, totalDuration]);

  // Redraw waveform when zoom or data changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !totalDuration) return;
    canvas.width  = Math.ceil(totalDuration * pps);
    canvas.height = TRACK_H;
    drawWaveform(canvas, waveform, segments, gaps, pps);
  }, [waveform, segments, gaps, totalDuration, pps]);

  // Keep ppsRef in sync for use inside stable event handlers
  useEffect(() => { ppsRef.current = pps; }, [pps]);

  // Playhead + auto-scroll
  useEffect(() => {
    if (!totalDuration) return;
    const update = () => {
      const video    = globalVideoRef.current;
      const head     = playheadRef.current;
      const scroller = scrollRef.current;
      if (!video || !head || !scroller) return;
      const x = video.currentTime * ppsRef.current;
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

  // Scroll-wheel zoom — zooms around the cursor position
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return; // only zoom with Ctrl/Cmd held
      e.preventDefault();
      const rect     = scroller.getBoundingClientRect();
      const mouseX   = e.clientX - rect.left;          // px from left edge of viewport
      const timeCursor = (scroller.scrollLeft + mouseX) / ppsRef.current;

      const factor  = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const newPps  = Math.max(PX_MIN, Math.min(PX_MAX, ppsRef.current * factor));
      setPps(newPps);
      // After state update, re-center on the time under cursor
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollLeft = timeCursor * newPps - mouseX;
        }
      });
    };
    scroller.addEventListener('wheel', onWheel, { passive: false });
    return () => scroller.removeEventListener('wheel', onWheel);
  }, []);

  const seekAndScroll = useCallback((time) => {
    if (globalVideoRef.current) globalVideoRef.current.currentTime = time;
    for (let i = 0; i < timeline.length; i++) {
      const item = timeline[i];
      if (item.type === 'word' && !item.removed && item.end >= time) {
        scrollToWord(i); break;
      }
    }
  }, [timeline, scrollToWord]);

  // Segment edge drag-to-resize
  const onSegMouseDown = useCallback((e, seg) => {
    e.preventDefault();
    e.stopPropagation();
    const rect   = e.currentTarget.getBoundingClientRect();
    const xInEl  = e.clientX - rect.left;
    const isLeft  = xInEl <= EDGE_ZONE;
    const isRight = xInEl >= rect.width - EDGE_ZONE;

    if (!isLeft && !isRight) {
      const startX = e.clientX;
      const onUp = (ev) => {
        if (Math.abs(ev.clientX - startX) < 4) seekAndScroll(seg.start);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mouseup', onUp);
      return;
    }

    dragState.current = { seg, isLeft, isRight, startX: e.clientX, liveStart: seg.start, liveEnd: seg.end };

    const onMove = (ev) => {
      const ds = dragState.current;
      if (!ds) return;
      const dx = (ev.clientX - ds.startX) / ppsRef.current;
      if (ds.isLeft)  ds.liveStart = Math.max(0, seg.start + dx);
      if (ds.isRight) ds.liveEnd   = Math.min(totalDuration, seg.end + dx);
    };

    const onUp = () => {
      const ds = dragState.current;
      if (ds) {
        const ns = ds.liveStart;
        const ne = ds.liveEnd;
        if (ns !== seg.start || ne !== seg.end) resizeSegment(seg.start, seg.end, ns, ne);
      }
      dragState.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
  }, [totalDuration, seekAndScroll, resizeSegment]);

  // Ruler click → seek
  const onRulerClick = useCallback((e) => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const x = e.clientX - scroller.getBoundingClientRect().left + scroller.scrollLeft;
    seekAndScroll(x / ppsRef.current);
  }, [seekAndScroll]);

  // Panel vertical resize
  const onPanelResizeDown = useCallback((e) => {
    e.preventDefault();
    panelDrag.current = true;
    const startY = e.clientY;
    const startH = panelH;
    const onMove = (ev) => {
      if (!panelDrag.current) return;
      setPanelH(Math.max(MIN_H, Math.min(MAX_H, startH + (startY - ev.clientY))));
    };
    const onUp = () => {
      panelDrag.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
  }, [panelH]);

  if (!totalDuration) return null;

  const innerW   = Math.ceil(totalDuration * pps);
  const px       = (t) => t * pps;
  const wpx      = (s, e) => Math.max(2, (e - s) * pps);
  const interval = tickInterval(pps);
  const ticks    = [];
  for (let t = 0; t <= totalDuration; t += interval) ticks.push(t);

  return (
    <div
      ref={panelRef}
      className="shrink-0 border-t border-neutral-800 bg-[#0c0c0c] relative select-none"
      style={{ height: panelH }}
      onMouseMove={(e) => {
        const rect = panelRef.current.getBoundingClientRect();
        setHoverX(e.clientX - rect.left);
      }}
      onMouseLeave={() => setHoverX(null)}
    >
      {/* Vertical resize handle */}
      <div
        className="absolute top-0 left-0 right-0 z-20 cursor-ns-resize flex items-center justify-center"
        style={{ height: 6 }}
        onMouseDown={onPanelResizeDown}
      >
        <div className="w-10 h-0.5 rounded-full bg-neutral-700 hover:bg-neutral-400 transition-colors" />
      </div>

      {/* Scrollable area — full remaining height so playhead can span it */}
      <div
        ref={scrollRef}
        className="scrollbar-thin overflow-x-auto absolute left-0 right-0"
        style={{ top: 6, height: panelH - 6 }}
      >
        <div className="relative" style={{ width: innerW, height: panelH - 6, minWidth: '100%' }}>

          {/* Ruler — always at top */}
          <div
            className="absolute top-0 left-0 right-0 cursor-pointer"
            style={{ height: RULER_H }}
            onClick={onRulerClick}
          >
            {ticks.map((t) => (
              <div
                key={t}
                className="pointer-events-none absolute top-0 flex flex-col items-center"
                style={{ left: px(t), transform: 'translateX(-50%)' }}
              >
                <span className="text-[9px] text-neutral-500 tabular-nums leading-tight pt-[3px]">
                  {fmtTick(t)}
                </span>
              </div>
            ))}
          </div>

          {/* Flex area below ruler — centers the track vertically */}
          <div
            className="absolute left-0 right-0 flex items-center"
            style={{ top: RULER_H, bottom: 0 }}
          >
          {/* Track */}
          <div className="relative w-full" style={{ height: TRACK_H }}>
            {/* Grid lines */}
            {ticks.map((t) => (
              <div
                key={`grid-${t}`}
                className="pointer-events-none absolute inset-y-0"
                style={{ left: px(t), width: 1, background: 'rgba(255,255,255,0.05)' }}
              />
            ))}

            <canvas
              ref={canvasRef}
              className="absolute inset-0 pointer-events-none"
              style={{ width: innerW, height: TRACK_H, imageRendering: 'pixelated' }}
            />

            {gaps.map((gap, i) => (
              <div
                key={`gap-${i}`}
                className="absolute inset-y-0"
                style={{
                  left:       px(gap.start),
                  width:      wpx(gap.start, gap.end),
                  background: 'rgba(168,85,247,0.22)',
                  border:     '1px solid rgba(168,85,247,0.70)',
                  borderRadius: 2,
                  cursor:     'pointer',
                }}
                onClick={() => seekAndScroll(gap.start)}
                title={`Gap: ${gap.start.toFixed(1)}s – ${gap.end.toFixed(1)}s`}
              />
            ))}

            {segments.map((seg, i) => (
              <div
                key={`seg-${i}`}
                className="absolute inset-y-0"
                style={{
                  left:   px(seg.start),
                  width:  wpx(seg.start, seg.end),
                  border: '1px solid rgba(52,211,153,0.55)',
                  borderRadius: 2,
                  cursor: 'ew-resize',
                }}
                onMouseDown={(e) => onSegMouseDown(e, seg)}
                onDoubleClick={() => toggleSegment(seg.start, seg.end)}
                title={`${seg.start.toFixed(1)}s – ${seg.end.toFixed(1)}s (double-click to toggle)`}
              />
            ))}
          </div>{/* end track */}
          </div>{/* end flex centering wrapper */}

          {/* Playhead — full height of the scrollable area */}
          <div
            ref={playheadRef}
            className="pointer-events-none absolute top-0 bottom-0 w-px bg-white/60 z-10"
            style={{ left: 0 }}
          />
        </div>
      </div>

      {/* Hover line — full panel height, green, follows mouse */}
      {hoverX !== null && (
        <div
          className="pointer-events-none absolute z-30"
          style={{
            left:       hoverX,
            top:        6,
            bottom:     0,
            width:      1,
            background: 'rgba(52,211,153,0.40)',
          }}
        />
      )}
    </div>
  );
}
