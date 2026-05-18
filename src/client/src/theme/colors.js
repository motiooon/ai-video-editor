/** Hex colors for each word-removal reason. Used in WordChip + Legend. */
export const REMOVAL_COLORS = {
  filler:        '#ef4444',
  duplicate:     '#f97316',
  'false-start': '#f59e0b',
  redundant:     '#a855f7',
  'ai-clarity':  '#a855f7',
  'too-short':   '#6b7280',
  user:          '#6b7280',
};

/** Short human-readable label for each reason. Used in Legend. */
export const REMOVAL_LABELS = {
  filler:        'Filler',
  duplicate:     'Duplicate',
  'false-start': 'False start',
  redundant:     'Redundant',
  'ai-clarity':  'AI suggestion',
  'too-short':   'Too short',
  user:          'Removed by you',
};

/** Tooltip text for word chips in the transcript. */
export const REMOVAL_TOOLTIPS = {
  filler:        'Removed: filler — click to restore',
  duplicate:     'Removed: duplicate — click to restore',
  'false-start': 'Removed: false start — click to restore',
  redundant:     'Removed: redundant — click to restore',
  'ai-clarity':  'Claude suggestion — click to restore',
  'too-short':   'Removed: too short — click to restore',
  user:          'Removed by you — click to restore',
};

/** Gap block appearance by state. */
export const GAP_KEPT = {
  background: 'rgba(16,185,129,0.12)',
  border:     '1px solid rgba(16,185,129,0.30)',
  color:      'rgba(52,211,153,0.85)',
};

export const GAP_REMOVED = {
  background: 'rgba(239,68,68,0.10)',
  border:     '1px solid rgba(239,68,68,0.25)',
  color:      'rgba(252,165,165,0.50)',
  opacity:    0.6,
};
