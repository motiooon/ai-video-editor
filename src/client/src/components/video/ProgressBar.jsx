import { useEffect, useRef } from 'react';
import { videoRef as globalVideoRef } from '../../lib/videoRef.js';

/** Yellow scrub bar drawn over the bottom edge of the video via RAF. */
export function ProgressBar() {
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const video = globalVideoRef.current;
      const ctx   = canvas.getContext('2d');
      const { width: w, height: h } = canvas;
      ctx.clearRect(0, 0, w, h);

      if (video && video.duration && !isNaN(video.duration)) {
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(250,204,21,0.85)';
        ctx.fillRect(0, 0, (video.currentTime / video.duration) * w, h);
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={4}
      className="absolute bottom-0 left-0 w-full"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}
