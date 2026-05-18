import OpenAI from 'openai';
import { createReadStream } from 'fs';
import { getSession } from './session.js';

const CONCURRENCY = 3;

let _client = null;
function getClient(apiKey) {
  if (!_client) _client = new OpenAI({ apiKey });
  return _client;
}

async function transcribeChunk(filePath, startOffset, config) {
  const response = await getClient(config.openaiApiKey).audio.transcriptions.create({
    file: createReadStream(filePath),
    model: config.whisperModel ?? 'whisper-1',
    language: config.whisperLanguage ?? 'en',
    response_format: 'verbose_json',
    timestamp_granularities: ['word'],
  });

  const words = (response.words ?? []).map((w) => ({
    word: w.word.trim(),
    start: w.start + startOffset,
    end: w.end + startOffset,
  }));
  return { text: response.text ?? '', words, duration: (response.duration ?? 0) + startOffset };
}

async function transcribeChunks(chunks, config, onProgress) {
  const results = new Array(chunks.length);
  let completed = 0;

  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const batch = chunks.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(({ filePath, startOffset }) => transcribeChunk(filePath, startOffset, config))
    );
    batchResults.forEach((r, j) => { results[i + j] = r; });
    completed += batch.length;
    onProgress?.(completed, chunks.length);
  }

  return {
    text:     results.map((r) => r.text).join(' ').trim(),
    words:    results.flatMap((r) => r.words),
    duration: Math.max(...results.map((r) => r.duration)),
  };
}

export const tools = [
  {
    name: 'transcribe',
    description: 'Transcribe the audio via Whisper API with word-level timestamps.',
    input_schema: {
      type: 'object',
      properties: { session_id: { type: 'string' } },
      required: ['session_id'],
    },
    async fn({ session_id }, { onProgress } = {}) {
      const s = getSession(session_id);
      if (!s.chunks) throw new Error('Call prepare_file first');

      const { words, duration } = await transcribeChunks(s.chunks, s.config, onProgress);
      s.words    = words;
      s.duration = duration;
      return { word_count: words.length, duration_seconds: Math.round(duration * 10) / 10 };
    },
  },
];
