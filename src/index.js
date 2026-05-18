import chokidar from 'chokidar';
import chalk from 'chalk';
import { readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { execFile } from 'child_process';
import { promisify } from 'util';
import { processFile } from './agent.js';

const execFileAsync = promisify(execFile);
async function checkFfmpeg() {
  try { await execFileAsync('ffmpeg', ['-version']); return true; } catch { return false; }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.resolve(__dirname, '..', 'config.json');

const processing = new Set();

async function main() {
  const config = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));

  if (!config.openaiApiKey) {
    console.error(chalk.red('✗ Set openaiApiKey in config.json before running.'));
    process.exit(1);
  }
  if (!config.anthropicApiKey) {
    console.error(chalk.red('✗ Set anthropicApiKey in config.json before running.'));
    process.exit(1);
  }

  const hasFfmpeg = await checkFfmpeg();
  if (!hasFfmpeg) {
    console.error(chalk.red('✗ ffmpeg not found. Install it with: brew install ffmpeg'));
    process.exit(1);
  }

  const inputDir = path.resolve(__dirname, '..', config.inputDir);
  if (!existsSync(inputDir)) await mkdir(inputDir, { recursive: true });

  const supported = new Set(config.supportedExtensions ?? ['.mp3', '.mp4', '.m4a', '.wav', '.mov']);

  console.log(chalk.bold('AI Clipper running (agent mode)'));
  console.log(chalk.gray(`Watching: ${inputDir}`));
  console.log(chalk.gray('Drop a file into the input folder to start.\n'));

  const watcher = chokidar.watch(inputDir, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 500 },
  });

  watcher.on('add', async (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (!supported.has(ext)) {
      console.log(chalk.gray(`Ignored: ${path.basename(filePath)}`));
      return;
    }
    if (processing.has(filePath)) return;
    processing.add(filePath);

    try {
      await processFile(filePath, config);
    } catch (err) {
      console.error(chalk.red(`  ✗ ${err.message}`));
      if (process.env.DEBUG) console.error(err);
    } finally {
      processing.delete(filePath);
    }
  });

  watcher.on('error', (err) => console.error(chalk.red(`Watcher error: ${err.message}`)));
}

main().catch((err) => {
  console.error(chalk.red(`Fatal: ${err.message}`));
  process.exit(1);
});
