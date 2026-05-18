import crypto from 'crypto';
import path from 'path';
import { readFile, rm } from 'fs/promises';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.resolve(__dirname, '..', '..', 'config.json');

// ── In-memory session store ───────────────────────────────────────────────

const store = new Map();

export function createSession(filePath, config) {
  const id = crypto.randomUUID();
  store.set(id, {
    filePath, config,
    tmpDir: null, proxyPath: null, chunks: null,
    words: null, duration: null, annotatedWords: null,
    timeline: null, approvedTimeline: null,
  });
  return id;
}

export function getSession(id) {
  const s = store.get(id);
  if (!s) throw new Error(`Session not found: ${id}`);
  return s;
}

export function deleteSession(id) {
  store.delete(id);
}

// ── Tool definitions ──────────────────────────────────────────────────────

export const tools = [
  {
    name: 'start_session',
    description: 'Create a processing session for a media file. Returns a session_id needed by all other tools.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the media file' },
      },
      required: ['file_path'],
    },
    async fn({ file_path, config: provided }) {
      const config = provided ?? JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
      const id = createSession(file_path, config);
      return { session_id: id, filename: path.basename(file_path) };
    },
  },
  {
    name: 'end_session',
    description: 'Clean up temporary files and release the session. Always call this last, even on error.',
    input_schema: {
      type: 'object',
      properties: { session_id: { type: 'string' } },
      required: ['session_id'],
    },
    async fn({ session_id }) {
      const s = getSession(session_id);
      if (s.tmpDir) await rm(s.tmpDir, { recursive: true, force: true }).catch(() => {});
      deleteSession(session_id);
      return { ok: true };
    },
  },
];
