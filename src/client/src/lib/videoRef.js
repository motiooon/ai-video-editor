/**
 * Module-level singleton ref for the video element.
 * Allows WordChip and GapChip to scrub the video
 * without prop drilling.
 */
export const videoRef = { current: null };
