import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, writeFile, rm, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { getSession } from './session.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);

function ffmpeg(args) {
  return execFileAsync('ffmpeg', args, { maxBuffer: 100 * 1024 * 1024 });
}

function buildSegments(timelineItems, maxGapSeconds = 0.3) {
  const segments = [];
  let seg = null;
  for (const item of timelineItems) {
    if (item.type === 'word') {
      if (item.removed) {
        if (seg) { segments.push(seg); seg = null; }
      } else {
        if (!seg) seg = { start: item.start, end: item.end };
        else      seg.end = item.end;
      }
    } else if (item.type === 'gap') {
      if (item.removed) {
        if (seg) {
          seg.end = Math.min(item.start + maxGapSeconds, item.end);
          segments.push(seg);
          seg = null;
        }
      } else if (seg) {
        seg.end = item.end;
      }
    }
  }
  if (seg) segments.push(seg);
  return segments;
}

function summarize(timelineItems, segments) {
  const wordItems = timelineItems.filter((i) => i.type === 'word');
  const originalDuration = wordItems.length > 0
    ? wordItems[wordItems.length - 1].end - wordItems[0].start : 0;
  const keptDuration = segments.reduce((a, s) => a + (s.end - s.start), 0);
  const round = (n) => Math.round(n * 100) / 100;
  return {
    totalWords:       wordItems.length,
    removedWords:     wordItems.filter((w) => w.removed).length,
    originalDuration: round(originalDuration),
    keptDuration:     round(keptDuration),
    removedSeconds:   round(originalDuration - keptDuration),
    segmentCount:     segments.length,
  };
}

async function exportSegments(inputPath, segments, outputPath) {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'aiclip-'));
  try {
    const ext = path.extname(inputPath);
    const segmentPaths = [];
    for (let i = 0; i < segments.length; i++) {
      const { start, end } = segments[i];
      const segPath = path.join(tmpDir, `seg_${String(i).padStart(4, '0')}${ext}`);
      await ffmpeg([
        '-y', '-i', inputPath,
        '-ss', String(start), '-t', String(end - start),
        '-c', 'copy', '-avoid_negative_ts', 'make_zero',
        segPath,
      ]);
      segmentPaths.push(segPath);
    }
    const listPath = path.join(tmpDir, 'concat.txt');
    await writeFile(listPath, segmentPaths.map((p) => `file '${p}'`).join('\n'), 'utf8');
    await ffmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', outputPath]);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

export const tools = [
  {
    name: 'export',
    description: 'Export the approved edit as a lossless file using FFmpeg stream copy.',
    input_schema: {
      type: 'object',
      properties: { session_id: { type: 'string' } },
      required: ['session_id'],
    },
    async fn({ session_id }) {
      const s = getSession(session_id);
      if (!s.approvedTimeline) throw new Error('Call open_review first');

      const maxGap = s.config.maxGapSeconds ?? 0.3;
      const segments = buildSegments(s.approvedTimeline, maxGap);
      if (segments.length === 0) return { status: 'nothing_to_export' };

      const outputDir = path.resolve(__dirname, '..', '..', s.config.outputDir);
      if (!existsSync(outputDir)) await mkdir(outputDir, { recursive: true });

      const base      = path.basename(s.filePath, path.extname(s.filePath));
      const ext       = path.extname(s.filePath);
      const outputPath = path.join(outputDir, `${base}_clipped${ext}`);

      await exportSegments(s.filePath, segments, outputPath);
      return { status: 'done', output_path: outputPath, ...summarize(s.approvedTimeline, segments) };
    },
  },
];
