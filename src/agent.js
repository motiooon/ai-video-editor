import Anthropic from '@anthropic-ai/sdk';
import chalk from 'chalk';
import { stat, readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { TOOL_DEFS, invoke, startSession, endSession, getSession } from './tools/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SYSTEM_PROMPT = await readFile(
  path.join(__dirname, 'agent-prompt.md'),
  'utf8',
);

// Tools exposed to Claude — apply_rules excluded (Claude handles all annotation)
const AGENT_TOOLS = TOOL_DEFS.filter((t) => !['start_session', 'apply_rules'].includes(t.name));


export async function processFile(filePath, config) {
  if (!config.anthropicApiKey) {
    throw new Error('anthropicApiKey required for agent mode');
  }

  const fileSize = await stat(filePath).then((s) => fmtBytes(s.size)).catch(() => '?');
  const ext = path.extname(filePath).toUpperCase().slice(1) || '?';
  const filename = path.basename(filePath);

  console.log(`\n${chalk.bold('◆')} ${chalk.white(filename)}  ${chalk.gray(`${fileSize} · ${ext}`)}`);

  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  const { session_id } = await startSession({ file_path: filePath, config });
  const totalStart = Date.now();

  const messages = [
    {
      role: 'user',
      content: `Process this media file for editing.\nFile: ${filePath}\nSession ID: ${session_id}`,
    },
  ];

  try {
    while (true) {
      const response = await client.messages
        .stream({
          model: 'claude-opus-4-7',
          max_tokens: 16000,
          thinking: { type: 'adaptive' },
          system: SYSTEM_PROMPT,
          tools: AGENT_TOOLS,
          messages,
        })
        .finalMessage();

      messages.push({ role: 'assistant', content: response.content });

      for (const block of response.content) {
        if (block.type === 'text' && block.text.trim()) {
          console.log(chalk.dim(`  ${block.text.trim().slice(0, 120)}`));
        }
      }

      if (response.stop_reason === 'end_turn') break;

      const toolResults = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;

        const session = tryGetSession(session_id);
        const startLabel = describeStart(block.name, block.input, session);

        process.stdout.write(`\n  ${chalk.cyan('→')} ${startLabel}`);
        let lineLen = 4 + startLabel.length;

        const t0 = Date.now();

        const opts = {
          onProgress(done, total) {
            const suffix = chalk.gray(` [chunk ${done}/${total}]`);
            const line = `\n  ${chalk.cyan('→')} ${startLabel}${suffix}`;
            process.stdout.write(`\r${' '.repeat(lineLen)}\r  ${chalk.cyan('→')} ${startLabel}${suffix}`);
            lineLen = 4 + startLabel.length + suffix.replace(/\x1b\[[0-9;]*m/g, '').length;
          },
          onReady(url) {
            clearLine(lineLen);
            console.log(`  ${chalk.cyan('→')} ${startLabel}`);
            console.log(`     ${chalk.gray('URL')}  ${chalk.underline.cyan(url)}`);
            console.log(`     ${chalk.gray('Waiting for approval...')}`);
            lineLen = 0;
          },
        };

        let result;
        try {
          result = await invoke(block.name, block.input, opts);
          const elapsed = fmtElapsed(Date.now() - t0);
          clearLine(lineLen);
          const doneLabel = describeResult(block.name, result, session);
          console.log(`  ${chalk.green('✓')} ${doneLabel}  ${chalk.gray(elapsed)}`);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
        } catch (err) {
          const elapsed = fmtElapsed(Date.now() - t0);
          clearLine(lineLen);
          console.log(`  ${chalk.red('✗')} ${block.name}: ${err.message}  ${chalk.gray(elapsed)}`);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            is_error: true,
            content: err.message,
          });
        }
      }

      messages.push({ role: 'user', content: toolResults });
    }

    console.log(`\n  ${chalk.bold.green('Done')}  ${chalk.gray(fmtElapsed(Date.now() - totalStart))}\n`);
  } catch (err) {
    await endSession({ session_id }).catch(() => {});
    throw err;
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function tryGetSession(id) {
  try { return getSession(id); } catch { return null; }
}

function clearLine(len) {
  if (len > 0) process.stdout.write(`\r${' '.repeat(len + 2)}\r`);
}

function describeStart(name, input, session) {
  const ext = session ? path.extname(session.filePath).toUpperCase().slice(1) : '?';
  switch (name) {
    case 'prepare_file': {
      const isVideo = ext && !['MP3', 'WAV', 'M4A', 'FLAC', 'OGG'].includes(ext);
      return isVideo
        ? `Extracting audio + generating preview proxy  (${ext})`
        : `Preparing audio file for Whisper  (${ext})`;
    }
    case 'transcribe': {
      const n = session?.chunks?.length ?? 1;
      const model = session?.config?.whisperModel ?? 'whisper-1';
      const lang  = session?.config?.whisperLanguage ?? 'en';
      return `Transcribing with Whisper  (${model} · ${lang} · ${n} chunk${n !== 1 ? 's' : ''})`;
    }
    case 'get_transcript': {
      const n = session?.words?.length?.toLocaleString() ?? '?';
      return `Reading transcript  (${n} words)`;
    }
    case 'mark_removed': {
      const n      = input.indices?.length ?? 0;
      const reason = input.reason ?? 'ai-clarity';
      return `Marking ${n} word${n !== 1 ? 's' : ''} for removal  (${reason})`;
    }
    case 'mark_kept': {
      const n = input.indices?.length ?? 0;
      return `Restoring ${n} word${n !== 1 ? 's' : ''}`;
    }
    case 'build_timeline': return `Building edit timeline`;
    case 'open_review':   return `Opening review UI`;
    case 'export':        return `Exporting  (FFmpeg lossless stream copy)`;
    case 'end_session':   return `Cleaning up temp files`;
    default:              return name;
  }
}

function describeResult(name, result, session) {
  switch (name) {
    case 'prepare_file': {
      const n       = result.chunk_count ?? 1;
      const audio   = result.native_audio ? 'no conversion needed' : 'extracted to 64 kbps MP3, 16 kHz mono';
      const proxy   = result.has_video ? ' · preview proxy generated' : '';
      return `Ready  ·  ${n} audio chunk${n !== 1 ? 's' : ''}  (${audio})${proxy}`;
    }
    case 'transcribe': {
      const words = (result.word_count ?? 0).toLocaleString();
      const dur   = fmtDuration(result.duration_seconds ?? 0);
      return `Transcribed  ·  ${words} words  ·  ${dur} of audio`;
    }
    case 'get_transcript':
      return `Transcript loaded  ·  ${(result.total_words ?? 0).toLocaleString()} words`;
    case 'mark_removed': {
      const n = result.marked ?? 0;
      return `Marked ${n} word${n !== 1 ? 's' : ''} removed`;
    }
    case 'mark_kept': {
      const n = result.restored ?? 0;
      return `Restored ${n} word${n !== 1 ? 's' : ''}`;
    }
    case 'build_timeline': {
      const removed = result.removed_words ?? 0;
      const gaps    = result.removed_gaps ?? 0;
      const total   = session?.words?.length ?? 0;
      const kept    = (total - removed).toLocaleString();
      return `Timeline built  ·  ${kept} words kept  ·  ${removed} words + ${gaps} silence gaps removed`;
    }
    case 'open_review':
      return `Approved`;
    case 'export': {
      if (result.status === 'nothing_to_export') return `Nothing to export`;
      const out  = path.basename(result.output_path ?? '');
      const orig = fmtDuration(result.originalDuration ?? 0);
      const kept = fmtDuration(result.keptDuration ?? 0);
      const segs = result.segmentCount ?? '?';
      return `Exported → ${out}  ·  ${orig} → ${kept}  ·  ${segs} segment${segs !== 1 ? 's' : ''}`;
    }
    case 'end_session':
      return `Temp files removed`;
    default: {
      const { session_id: _s, ...rest } = result;
      return JSON.stringify(rest).slice(0, 80);
    }
  }
}

function fmtBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function fmtDuration(seconds) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s < 10 ? '0' : ''}${s}s`;
}

function fmtElapsed(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return `${m}m ${s < 10 ? '0' : ''}${s}s`;
}
