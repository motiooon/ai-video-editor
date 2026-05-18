import { useEffect, useRef, useState, useCallback } from 'react';
import { useReviewStore } from '../../store.js';
import { videoRef as globalVideoRef } from '../../lib/videoRef.js';
import { ProgressBar }     from './ProgressBar.jsx';
import { PreviewControls } from './PreviewControls.jsx';

export function VideoPane() {
  const reviewId     = useReviewStore((s) => s.reviewId);
  const setActiveWord  = useReviewStore((s) => s.setActiveWord);
  const startPreview   = useReviewStore((s) => s.startPreview);
  const advancePreview = useReviewStore((s) => s.advancePreview);
  const isPreviewing   = useReviewStore((s) => s.isPreviewing);

  const videoRef  = useRef(null);
  const rafRef    = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Wire global singleton ref
  useEffect(() => {
    globalVideoRef.current = videoRef.current;
    return () => { globalVideoRef.current = null; };
  }, []);

  // Track play/pause state
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onPlay  = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    video.addEventListener('play',  onPlay);
    video.addEventListener('pause', onPause);
    return () => {
      video.removeEventListener('play',  onPlay);
      video.removeEventListener('pause', onPause);
    };
  }, []);

  // Spacebar → play/pause
  useEffect(() => {
    const onKey = (e) => {
      if (e.code !== 'Space') return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      e.preventDefault();
      const video = videoRef.current;
      if (!video) return;
      video.paused ? video.play() : video.pause();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // timeupdate: word highlighting only (preview jumping handled by rAF loop below)
  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setActiveWord(video.currentTime);
  }, [setActiveWord]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleTimeUpdate);
  }, [handleTimeUpdate]);

  // rAF loop — runs at ~60fps during preview for frame-accurate gap detection
  useEffect(() => {
    if (!isPreviewing) {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      return;
    }
    const tick = () => {
      const video = globalVideoRef.current;
      if (!video || video.paused) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const next = advancePreview(video.currentTime);
      if (typeof next === 'number') {
        video.currentTime = next;
      } else if (next === 'done') {
        video.pause();
        return; // store already set isPreviewing:false — effect will clean up
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; } };
  }, [isPreviewing, advancePreview]);

  const handlePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;
    video.paused ? video.play() : video.pause();
  };

  const handleStartPreview = () => {
    const startTime = startPreview();
    const video = videoRef.current;
    if (video && startTime !== null) {
      video.currentTime = startTime;
      video.play();
    }
  };

return (
    <div className="flex h-full flex-col bg-neutral-950">
      {/* Video */}
      <div className="relative flex-1 min-h-0 bg-black">
        <video
          ref={videoRef}
          src={`/review/${reviewId}/video`}
          preload="auto"
          className="h-full w-full object-contain"
        />
        <ProgressBar />
      </div>

      {/* Controls */}
      <PreviewControls
        isPlaying={isPlaying}
        onPlayPause={handlePlayPause}
        onStartPreview={handleStartPreview}
      />
    </div>
  );
}
