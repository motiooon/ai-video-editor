import { useEffect, useRef } from 'react';
import { useReviewStore } from '../../store.js';
import { videoRef as globalVideoRef } from '../../lib/videoRef.js';
import { buildSegments } from '../../lib/segments.js';

/** Canvas bar showing which portions of the video are kept (green). */
export function SegmentMap() {
  const timeline      = useReviewStore((s) => s.timeline);
  const maxGapSeconds = useReviewStore((s) => s.maxGapSeconds);
  const canvasRef     = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const redraw = () => {
      const video    = globalVideoRef.current;
      const duration = video?.duration;
      if (!duration || isNaN(duration)) return;

      const ctx              = canvas.getContext('2d');
      const { width: w, height: h } = canvas;
      ctx.clearRect(0, 0, w, h);

      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fillRect(0, 0, w, h);

      const segments = buildSegments(timeline, maxGapSeconds);
      ctx.fillStyle  = 'rgba(52,211,153,0.55)';
      for (const seg of segments) {
        const x    = (seg.start / duration) * w;
        const segW = Math.max(1, ((seg.end - seg.start) / duration) * w);
        ctx.fillRect(x, 0, segW, h);
      }
    };

    const video = globalVideoRef.current;
    if (video?.readyState >= 1) redraw();
    video?.addEventListener('loadedmetadata', redraw);
    return () => video?.removeEventListener('loadedmetadata', redraw);
  }, [timeline, maxGapSeconds]);

  return (
    <div className="shrink-0 px-3 pt-2 pb-1">
      <canvas
        ref={canvasRef}
        width={800}
        height={8}
        className="w-full rounded-sm"
        style={{ imageRendering: 'pixelated' }}
      />
      <p className="mt-0.5 text-right text-[10px] text-neutral-600">kept segments</p>
    </div>
  );
}
