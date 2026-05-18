import { useEffect, useRef, useState, useCallback } from 'react';
import { useReviewStore } from '../../store.js';
import { videoRef as globalVideoRef } from '../../lib/videoRef.js';
import { ProgressBar }     from './ProgressBar.jsx';
import { PreviewControls } from './PreviewControls.jsx';

export function VideoPane() {
  const reviewId     = useReviewStore((s) => s.reviewId);
  const setActiveWord  = useReviewStore((s) => s.setActiveWord);
  const startPreview   = useReviewStore((s) => s.startPreview);
  const stopPreview    = useReviewStore((s) => s.stopPreview);
  const advancePreview = useReviewStore((s) => s.advancePreview);
  const isPreviewing   = useReviewStore((s) => s.isPreviewing);

  const videoRef  = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Wire global singleton ref
  useEffect(() => {
    globalVideoRef.current = videoRef.current;
    return () => { globalVideoRef.current = null; };
  }, []);

  // Sync isPlaying state for button icon
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onPlay  = () => setIsPlaying(true);
    const onPause = () => { setIsPlaying(false); if (isPreviewing) stopPreview(); };
    video.addEventListener('play',  onPlay);
    video.addEventListener('pause', onPause);
    return () => { video.removeEventListener('play', onPlay); video.removeEventListener('pause', onPause); };
  }, [isPreviewing, stopPreview]);

  // timeupdate: word highlighting + preview segment jumping
  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const ct = video.currentTime;
    setActiveWord(ct);
    if (isPreviewing) {
      const next = advancePreview(ct);
      if (typeof next === 'number') video.currentTime = next;
      else if (next === 'done')     video.pause();
    }
  }, [isPreviewing, setActiveWord, advancePreview]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleTimeUpdate);
  }, [handleTimeUpdate]);

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

  const handleStopPreview = () => {
    stopPreview();
    videoRef.current?.pause();
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
        onStopPreview={handleStopPreview}
      />
    </div>
  );
}
