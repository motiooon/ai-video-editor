import { execFile } from 'child_process';
import { promisify } from 'util';
import { stat, mkdtemp } from 'fs/promises';
import os from 'os';
import path from 'path';
import { getSession } from './session.js';

const execFileAsync = promisify(execFile);

const WHISPER_MAX_BYTES   = 25 * 1024 * 1024;
const WHISPER_NATIVE      = new Set(['.mp3', '.mp4', '.m4a', '.wav', '.webm', '.flac', '.ogg', '.mpga', '.mpeg']);
const MP3_BYTES_PER_SEC   = Math.ceil((64 * 1000) / 8);
const CHUNK_DURATION_SECS = Math.floor((WHISPER_MAX_BYTES * 0.9) / MP3_BYTES_PER_SEC);

function ffmpeg(args) {
  return execFileAsync('ffmpeg', args, { maxBuffer: 100 * 1024 * 1024 });
}

async function prepareAudio(inputPath, tmpDir) {
  const ext = path.extname(inputPath).toLowerCase();
  const { size } = await stat(inputPath);

  if (WHISPER_NATIVE.has(ext) && size <= WHISPER_MAX_BYTES) {
    return { chunks: [{ filePath: inputPath, startOffset: 0 }], native: true };
  }

  const audioPath = path.join(tmpDir, 'whisper.mp3');
  await ffmpeg([
    '-y', '-i', inputPath, '-vn',
    '-c:a', 'libmp3lame', '-b:a', '64k', '-ar', '16000', '-ac', '1',
    audioPath,
  ]);

  const { size: audioSize } = await stat(audioPath);
  if (audioSize <= WHISPER_MAX_BYTES) {
    return { chunks: [{ filePath: audioPath, startOffset: 0 }], native: false };
  }

  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', audioPath,
  ]);
  const totalDuration = parseFloat(stdout.trim());

  const chunks = [];
  let startOffset = 0;
  let idx = 0;
  while (startOffset < totalDuration) {
    const chunkPath = path.join(tmpDir, `chunk_${String(idx).padStart(4, '0')}.mp3`);
    const duration = Math.min(CHUNK_DURATION_SECS, totalDuration - startOffset);
    await ffmpeg(['-y', '-ss', String(startOffset), '-t', String(duration), '-i', audioPath, '-c', 'copy', chunkPath]);
    chunks.push({ filePath: chunkPath, startOffset });
    startOffset += duration;
    idx++;
  }
  return { chunks, native: false };
}

async function generateProxy(inputPath, tmpDir) {
  const proxyPath = path.join(tmpDir, 'proxy.mp4');
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=codec_type',
    '-of', 'default=noprint_wrappers=1:nokey=1', inputPath,
  ]);
  const hasVideo = stdout.trim() === 'video';

  const args = ['-y', '-i', inputPath];
  if (hasVideo) {
    args.push('-vf', 'scale=640:-2', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-c:a', 'aac', '-b:a', '96k');
  } else {
    args.push('-vn', '-c:a', 'aac', '-b:a', '96k');
  }
  args.push('-movflags', '+faststart', proxyPath);
  await ffmpeg(args);
  return proxyPath;
}

export const tools = [
  {
    name: 'prepare_file',
    description: 'Extract and compress audio for Whisper and generate a low-res proxy video for preview. Runs both in parallel.',
    input_schema: {
      type: 'object',
      properties: { session_id: { type: 'string' } },
      required: ['session_id'],
    },
    async fn({ session_id }) {
      const s = getSession(session_id);
      s.tmpDir = await mkdtemp(path.join(os.tmpdir(), 'aiclip-'));

      const [audioResult, proxyPath] = await Promise.all([
        prepareAudio(s.filePath, s.tmpDir),
        generateProxy(s.filePath, s.tmpDir).catch(() => s.filePath),
      ]);

      s.chunks    = audioResult.chunks;
      s.proxyPath = proxyPath;
      return {
        status: 'ready',
        chunk_count: audioResult.chunks.length,
        native_audio: audioResult.native,
        has_video: proxyPath !== s.filePath,
      };
    },
  },
];
