#!/usr/bin/env node
// takawasi-cli — TBA REST API wrapper
// Bundled into the desktop app; also usable as a standalone CLI
// Usage: takawasi-cli [chat|exec|help] [args...]
// Env: TAKAWASI_API_KEY or cookie from ~/.config/takawasi/session (optional)
//      TBA_ENGINE_URL (default: https://engine.takawasi-social.com)

import * as fs from 'fs';
import * as https from 'https';
import * as http from 'http';
import * as readline from 'readline';
import * as path from 'path';
import * as os from 'os';

const VERSION = '0.1.0';
const TBA_ENGINE = process.env.TBA_ENGINE_URL || 'https://engine.takawasi-social.com';
const CONFIG_DIR = path.join(os.homedir(), '.config', 'takawasi');
const SESSION_FILE = path.join(CONFIG_DIR, 'session');

function loadSession(): string {
  try { return fs.readFileSync(SESSION_FILE, 'utf-8').trim(); } catch { return ''; }
}

function saveSession(token: string): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(SESSION_FILE, token, { mode: 0o600 });
}

function buildHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const session = loadSession();
  const apiKey = process.env.TAKAWASI_API_KEY || '';
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...(session ? { 'Cookie': `cg_session=${session}` } : {}),
    ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
    ...extra,
  };
}

function postRequest(url: string, body: object, headers: Record<string, string>): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request({
      hostname: u.hostname,
      port: u.port ? parseInt(u.port) : undefined,
      path: u.pathname + u.search,
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(payload) },
    }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => resolve({ status: res.statusCode || 0, body: data }));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function streamRequest(url: string, body: object, headers: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request({
      hostname: u.hostname,
      port: u.port ? parseInt(u.port) : undefined,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        ...headers,
        'Accept': 'text/event-stream',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let buffer = '';
      const handleEvent = (eventName: string, rawData: string): void => {
        try {
          const parsed = JSON.parse(rawData) as {
            stage?: string;
            text?: string;
            final?: boolean;
            code?: string;
            message?: string;
            credits_used?: number;
          };
          if (eventName === 'chunk') {
            const stage = parsed.stage || '';
            const text = parsed.text || '';
            if (stage && stage !== 'execute') {
              process.stderr.write(`\r[${stage}${parsed.final ? ' final' : ''}] ${text}\n`);
            } else if (text) {
              process.stdout.write(text);
            }
            return;
          }
          if (eventName === 'done') {
            const credits = typeof parsed.credits_used === 'number' ? ` credits=${parsed.credits_used}` : '';
            process.stderr.write(`\n[done]${credits}\n`);
            return;
          }
          if (eventName === 'error') {
            const code = parsed.code ? `${parsed.code}: ` : '';
            process.stderr.write(`\n[error] ${code}${parsed.message || rawData}\n`);
          }
        } catch {
          process.stdout.write(rawData);
        }
      };
      const parseBlock = (block: string): void => {
        let eventName = 'message';
        const dataLines: string[] = [];
        for (const rawLine of block.split('\n')) {
          if (!rawLine || rawLine.startsWith(':')) continue;
          const colon = rawLine.indexOf(':');
          const field = colon >= 0 ? rawLine.slice(0, colon) : rawLine;
          let value = colon >= 0 ? rawLine.slice(colon + 1) : '';
          if (value.startsWith(' ')) value = value.slice(1);
          if (field === 'event') eventName = value;
          if (field === 'data') dataLines.push(value);
        }
        if (dataLines.length > 0) handleEvent(eventName, dataLines.join('\n'));
      };
      res.on('data', (chunk: Buffer) => {
        buffer = `${buffer}${chunk.toString()}`.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() || '';
        for (const block of blocks) parseBlock(block);
      });
      res.on('end', () => {
        if (buffer.trim()) parseBlock(buffer);
        process.stdout.write('\n');
        resolve();
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function cmdChat(args: string[]): Promise<void> {
  const message = args.join(' ').trim();
  if (!message) {
    // Interactive REPL
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const prompt = (): void => {
      rl.question('\ntakawasi> ', async (input) => {
        if (!input.trim() || input.trim() === 'exit' || input.trim() === 'quit') {
          rl.close(); return;
        }
        await streamRequest(`${TBA_ENGINE}/api/tba/chat/stream`, { message: input.trim() }, buildHeaders());
        prompt();
      });
    };
    console.log(`takawasi-cli v${VERSION} — TBA チャット (exit で終了)`);
    prompt();
  } else {
    await streamRequest(`${TBA_ENGINE}/api/tba/chat/stream`, { message }, buildHeaders());
  }
}

async function cmdExec(args: string[]): Promise<void> {
  const message = args.join(' ').trim();
  if (!message) { console.error('usage: takawasi-cli exec <task description>'); process.exit(1); }
  const { status, body } = await postRequest(`${TBA_ENGINE}/api/tba/chat`, { message }, buildHeaders());
  if (status >= 400) { console.error(`HTTP ${status}: ${body}`); process.exit(1); }
  try {
    const parsed = JSON.parse(body) as { result?: string; content?: string };
    console.log(parsed.result || parsed.content || body);
  } catch {
    console.log(body);
  }
}

function cmdHelp(): void {
  console.log(`takawasi-cli v${VERSION}
TBA (takawasi Base Agent) コマンドラインクライアント

使い方:
  takawasi-cli chat [メッセージ]   TBA にメッセージを送る（引数なしでREPL）
  takawasi-cli exec <タスク>        TBA にタスクを実行させる（JSON一括返し）
  takawasi-cli help                 このヘルプを表示

環境変数:
  TAKAWASI_API_KEY   API キー（なければ cg_session Cookie を使用）
  TBA_ENGINE_URL     エンジンURL（デフォルト: https://engine.takawasi-social.com）

設定ファイル:
  ~/.config/takawasi/session   cg_session トークン保存先
`);
}

async function main(): Promise<void> {
  const [, , cmd, ...args] = process.argv;
  switch (cmd) {
    case 'chat': await cmdChat(args); break;
    case 'exec': await cmdExec(args); break;
    case 'help': case '--help': case '-h': cmdHelp(); break;
    case undefined: cmdHelp(); break;
    default:
      // Default: treat all args as chat message
      await cmdChat([cmd, ...args]);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
