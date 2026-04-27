// renderer/app.ts — Takawasi ArticleForge App renderer
// ArticleForge 特化: 記事一覧 + カテゴリ/タグツリー + エージェントチャット(TBA articleforge固定) + 編集/プレビュー
// dockview-core (vanilla TS) で 3パネルレイアウト

import { createDockview } from 'dockview-core';
import type {
  DockviewApi,
  IContentRenderer,
  GroupPanelPartInitParameters,
  CreateComponentOptions,
  IDockviewPanel,
} from 'dockview-core';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';

// ── localStorage key ─────────────────────────────────────────────────────────
const LAYOUT_KEY = 'af-app-v1-layout';
const ARTICLEFORGE_URL = 'https://articleforge.takawasi-social.com';

// ── Panel IDs ─────────────────────────────────────────────────────────────────
const PANEL_IDS = ['articles', 'chat', 'preview'] as const;
type PanelId = typeof PANEL_IDS[number];

// ── Helper ───────────────────────────────────────────────────────────────────
function cloneTemplate(id: string): HTMLElement {
  const tmpl = document.getElementById(id) as HTMLTemplateElement | null;
  if (!tmpl) throw new Error(`Template not found: ${id}`);
  const node = tmpl.content.cloneNode(true) as DocumentFragment;
  const root = node.firstElementChild as HTMLElement;
  if (!root) throw new Error(`Template has no root element: ${id}`);
  return root;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Selected doc state (shared across panels) ─────────────────────────────────
let selectedDocId: string | null = null;
let selectedDocTitle: string | null = null;

function selectDoc(docId: string, docTitle: string): void {
  selectedDocId = docId;
  selectedDocTitle = docTitle;
  // Notify preview panel (elements may not be mounted yet if panel is closed)
  const previewTitle = document.getElementById('preview-doc-title');
  const wv = document.getElementById('wv-preview') as (HTMLElement & { src?: string }) | null;
  const placeholder = document.getElementById('preview-placeholder');
  const openLink = document.getElementById('preview-open-web') as HTMLAnchorElement | null;
  if (previewTitle) previewTitle.textContent = docTitle;
  if (wv && placeholder) {
    const url = `${ARTICLEFORGE_URL}/?doc_id=${encodeURIComponent(docId)}`;
    (wv as unknown as { src: string }).src = url;
    wv.classList.remove('hidden');
    placeholder.classList.add('hidden');
    if (openLink) {
      openLink.href = url;
      openLink.classList.remove('hidden');
    }
  }
}

// ── Articles panel ─────────────────────────────────────────────────────────────

class ArticlesRenderer implements IContentRenderer {
  readonly element: HTMLElement;
  constructor() {
    this.element = cloneTemplate('tmpl-articles');
  }
  init(_params: GroupPanelPartInitParameters): void {
    const btn = this.element.querySelector<HTMLButtonElement>('#btn-articles-refresh');
    if (btn) btn.addEventListener('click', () => { void loadArticlesInElement(this.element); });
    void loadArticlesInElement(this.element);
  }
}

interface ArticleDocSummary {
  doc_id: string;
  title: string;
  beat_count: number;
  preview: string;
  updated_at: string;
}

interface CategoryMetadata {
  category_id: string;
  name: string;
  parent_id?: string;
  created_at: string;
}

async function loadArticlesInElement(root: HTMLElement): Promise<void> {
  const list = root.querySelector<HTMLElement>('#articles-list');
  if (!list) return;
  list.innerHTML = '<div class="panel-placeholder">読み込み中...</div>';

  try {
    const [docsResult, catsResult] = await Promise.all([
      window.takawasi.articleforge.listDocs(),
      window.takawasi.articleforge.listCategories(),
    ]);

    if (!docsResult.ok) {
      list.innerHTML = `<div class="panel-placeholder">${escapeHtml(docsResult.error || '記事一覧の読み込みに失敗しました')}</div>`;
      return;
    }

    const docs = docsResult.data?.docs || [];
    const cats = catsResult.ok ? (catsResult.data?.categories || []) : [];

    if (docs.length === 0 && cats.length === 0) {
      list.innerHTML = '<div class="panel-placeholder">記事がありません。チャットで新しい記事を作りましょう。</div>';
      return;
    }

    list.innerHTML = '';

    // カテゴリ表示
    for (const cat of cats) {
      const catEl = document.createElement('div');
      catEl.className = 'articles-category';
      catEl.innerHTML = `
        <div class="articles-category-header" data-category-id="${escapeHtml(cat.category_id)}">
          <svg class="category-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="transition:transform 0.15s"><polyline points="9 18 15 12 9 6"/></svg>
          <span class="articles-category-title">${escapeHtml(cat.name)}</span>
        </div>
        <div class="articles-category-docs hidden" data-category-id="${escapeHtml(cat.category_id)}"></div>
      `;
      list.appendChild(catEl);

      const header = catEl.querySelector<HTMLElement>('.articles-category-header')!;
      const docsContainer = catEl.querySelector<HTMLElement>('.articles-category-docs')!;
      const arrow = header.querySelector<SVGElement>('.category-arrow')!;

      header.addEventListener('click', async () => {
        const isHidden = docsContainer.classList.contains('hidden');
        if (isHidden) {
          docsContainer.classList.remove('hidden');
          arrow.style.transform = 'rotate(90deg)';
          if (!docsContainer.dataset.loaded) {
            docsContainer.innerHTML = '<div class="panel-placeholder" style="font-size:0.8rem;padding:8px 16px">読み込み中...</div>';
            const result = await window.takawasi.articleforge.listByCategory(cat.category_id);
            docsContainer.dataset.loaded = '1';
            docsContainer.innerHTML = '';
            if (result.ok && result.data) {
              for (const doc of result.data.docs) {
                docsContainer.appendChild(createDocItem(doc));
              }
              if (result.data.docs.length === 0) {
                docsContainer.innerHTML = '<div class="panel-placeholder" style="font-size:0.8rem;padding:8px 16px">このカテゴリに記事がありません</div>';
              }
            } else {
              docsContainer.innerHTML = '<div class="panel-placeholder">読み込みエラー</div>';
            }
          }
        } else {
          docsContainer.classList.add('hidden');
          arrow.style.transform = '';
        }
      });
    }

    // 全記事表示
    if (docs.length > 0) {
      if (cats.length > 0) {
        const divider = document.createElement('div');
        divider.className = 'articles-divider';
        divider.textContent = 'すべての記事';
        list.appendChild(divider);
      }
      for (const doc of docs) {
        list.appendChild(createDocItem(doc));
      }
    }
  } catch (err) {
    const list2 = root.querySelector<HTMLElement>('#articles-list');
    if (list2) list2.innerHTML = `<div class="panel-placeholder">接続エラー: ${escapeHtml(String(err))}</div>`;
  }
}

function createDocItem(doc: ArticleDocSummary): HTMLElement {
  const item = document.createElement('div');
  item.className = 'articles-item';
  if (selectedDocId === doc.doc_id) item.classList.add('active');
  item.innerHTML = `
    <div class="articles-item-title">${escapeHtml(doc.title || '(無題)')}</div>
    <div class="articles-item-meta">${doc.beat_count} beats · ${escapeHtml((doc.updated_at || '').slice(0, 10))}</div>
  `;
  item.addEventListener('click', () => {
    document.querySelectorAll('.articles-item').forEach(el => el.classList.remove('active'));
    item.classList.add('active');
    selectDoc(doc.doc_id, doc.title || '(無題)');
  });
  return item;
}

// ── Chat panel (TBA, service=articleforge 固定) ────────────────────────────────

class ChatRenderer implements IContentRenderer {
  readonly element: HTMLElement;
  constructor() {
    this.element = cloneTemplate('tmpl-chat');
    const inputArea = this.element.querySelector<HTMLElement>('#chat-input-area');
    if (inputArea) {
      const input = inputArea.querySelector<HTMLElement>('#chat-input');
      const send = inputArea.querySelector<HTMLElement>('#chat-send');
      const stageLabel = inputArea.querySelector<HTMLElement>('#chat-stage-label');
      if (input && send) {
        const row = document.createElement('div');
        row.className = 'tba-input-row';
        if (stageLabel) inputArea.insertBefore(stageLabel, input);
        inputArea.insertBefore(row, input);
        row.appendChild(input);
        row.appendChild(send);
      }
    }
  }
  init(_params: GroupPanelPartInitParameters): void {
    initChatInElement(this.element);
  }
}

interface TbaSsePayload {
  stage?: string;
  text?: string;
  final?: boolean;
  code?: string;
  message?: string;
  turn_id?: string;
  credits_used?: number;
}

function initChatInElement(root: HTMLElement): void {
  let streaming = false;
  const input = root.querySelector<HTMLTextAreaElement>('#chat-input')!;
  const sendBtn = root.querySelector<HTMLButtonElement>('#chat-send')!;
  const stageLabel = root.querySelector<HTMLElement>('#chat-stage-label')!;
  const messages = root.querySelector<HTMLElement>('#chat-messages')!;

  function appendMsg(type: 'user' | 'assistant' | 'stage', text: string): HTMLElement {
    const div = document.createElement('div');
    div.className = `tba-msg ${type}`;
    div.textContent = text;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div;
  }

  function handleSseEvent(
    eventName: string,
    rawData: string,
    assistantDiv: HTMLElement,
    accumulated: { v: string },
  ): void {
    let payload: TbaSsePayload;
    try {
      payload = JSON.parse(rawData) as TbaSsePayload;
    } catch {
      accumulated.v += rawData;
      assistantDiv.textContent = accumulated.v;
      messages.scrollTop = messages.scrollHeight;
      return;
    }

    if (eventName === 'chunk') {
      const stage = payload.stage || '';
      const text = payload.text || '';
      const finalSuffix = payload.final ? ' final' : '';
      if (stage) stageLabel.textContent = `${stage}${finalSuffix}`;
      if (stage && stage !== 'execute') {
        appendMsg('stage', `[${stage}${finalSuffix}] ${text}`);
        return;
      }
      if (text) {
        accumulated.v += text;
        assistantDiv.textContent = accumulated.v;
        messages.scrollTop = messages.scrollHeight;
      }
      return;
    }

    if (eventName === 'done') {
      const credits = typeof payload.credits_used === 'number' ? ` credits=${payload.credits_used}` : '';
      appendMsg('stage', `[done]${credits}`);
      return;
    }

    if (eventName === 'error') {
      const code = payload.code ? `${payload.code}: ` : '';
      assistantDiv.textContent = `エラー: ${code}${payload.message || rawData}`;
      messages.scrollTop = messages.scrollHeight;
    }
  }

  function parseSseBlock(block: string, assistantDiv: HTMLElement, accumulated: { v: string }): void {
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
    if (dataLines.length > 0) {
      handleSseEvent(eventName, dataLines.join('\n'), assistantDiv, accumulated);
    }
  }

  async function send(): Promise<void> {
    if (streaming || !input.value.trim()) return;
    const message = input.value.trim();
    input.value = '';
    streaming = true;
    sendBtn.disabled = true;

    appendMsg('user', message);
    const assistantDiv = appendMsg('assistant', '');
    const accumulated = { v: '' };
    let sseBuffer = '';
    let finished = false;

    const streamId = `af-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    function finish(): void {
      if (finished) return;
      finished = true;
      window.takawasi.tba.removeListeners(streamId);
      stageLabel.textContent = '';
      if (!accumulated.v && !assistantDiv.textContent.trim()) {
        assistantDiv.textContent = '(応答なし)';
      }
      streaming = false;
      sendBtn.disabled = false;
    }

    function consumeSse(chunk: string): void {
      sseBuffer = `${sseBuffer}${chunk}`.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const blocks = sseBuffer.split('\n\n');
      sseBuffer = blocks.pop() || '';
      for (const block of blocks) parseSseBlock(block, assistantDiv, accumulated);
    }

    window.takawasi.tba.onChunk(streamId, consumeSse);
    window.takawasi.tba.onError(streamId, (err) => {
      assistantDiv.textContent = `接続エラー: ${err.status ? `HTTP ${err.status}: ` : ''}${err.message}`;
      messages.scrollTop = messages.scrollHeight;
    });
    window.takawasi.tba.onEnd(streamId, () => {
      if (sseBuffer.trim()) parseSseBlock(sseBuffer, assistantDiv, accumulated);
      finish();
    });

    try {
      const started = await window.takawasi.tba.start(streamId, message);
      if (!started.ok) {
        assistantDiv.textContent = `エラー: ${started.error || 'stream start failed'}`;
        finish();
      }
    } catch (err) {
      assistantDiv.textContent = `接続エラー: ${String(err)}`;
      finish();
    }
  }

  sendBtn.addEventListener('click', () => { void send(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  });
}

// ── Preview panel ─────────────────────────────────────────────────────────────

class PreviewRenderer implements IContentRenderer {
  readonly element: HTMLElement;
  constructor() {
    this.element = cloneTemplate('tmpl-preview');
  }
  init(_params: GroupPanelPartInitParameters): void {
    // If a doc is already selected, load it into this newly mounted panel
    if (selectedDocId && selectedDocTitle) {
      const title = this.element.querySelector<HTMLElement>('#preview-doc-title');
      const wv = this.element.querySelector<HTMLElement>('#wv-preview') as (HTMLElement & { src?: string }) | null;
      const placeholder = this.element.querySelector<HTMLElement>('#preview-placeholder');
      const openLink = this.element.querySelector<HTMLAnchorElement>('#preview-open-web');
      if (title) title.textContent = selectedDocTitle;
      if (wv && placeholder && selectedDocId) {
        const url = `${ARTICLEFORGE_URL}/?doc_id=${encodeURIComponent(selectedDocId)}`;
        (wv as unknown as { src: string }).src = url;
        wv.classList.remove('hidden');
        placeholder.classList.add('hidden');
        if (openLink) {
          openLink.href = url;
          openLink.classList.remove('hidden');
        }
      }
    }
  }
}

// ── Terminal (power-user, hidden by default) ──────────────────────────────────

class TerminalRenderer implements IContentRenderer {
  readonly element: HTMLElement;
  private _fitAddon: FitAddon | null = null;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'panel-content';
    this.element.id = 'panel-content-terminal';
    const container = document.createElement('div');
    container.id = 'terminal-container';
    container.className = 'terminal-container';
    this.element.appendChild(container);
  }

  init(_params: GroupPanelPartInitParameters): void {
    void initTerminalInElement(this.element, (fit) => { this._fitAddon = fit; });
  }

  layout(_width: number, _height: number): void {
    this._fitAddon?.fit();
  }

  dispose(): void {
    this._fitAddon = null;
  }
}

// ── Component factory ─────────────────────────────────────────────────────────

function componentFactory(options: CreateComponentOptions): IContentRenderer {
  switch (options.name) {
    case 'articles': return new ArticlesRenderer();
    case 'chat': return new ChatRenderer();
    case 'preview': return new PreviewRenderer();
    case 'terminal': return new TerminalRenderer();
    default: return new ChatRenderer();
  }
}

// ── Dockview setup ────────────────────────────────────────────────────────────

let dockviewApi: DockviewApi | null = null;

function buildDockview(container: HTMLElement): DockviewApi {
  return createDockview(container, {
    createComponent: componentFactory,
    theme: {
      name: 'dockview-theme-dark',
      className: 'dockview-theme-dark',
    },
    disableFloatingGroups: false,
  });
}

interface SavedLayout {
  version: number;
  layout: ReturnType<DockviewApi['toJSON']>;
}

function saveLayout(): void {
  if (!dockviewApi) return;
  try {
    const data: SavedLayout = { version: 1, layout: dockviewApi.toJSON() };
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(data));
  } catch {
    // non-fatal
  }
}

function tryRestoreLayout(api: DockviewApi): boolean {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw) as SavedLayout;
    if (saved.version !== 1 || !saved.layout) return false;
    api.fromJSON(saved.layout);
    return true;
  } catch {
    return false;
  }
}

function addDefaultPanels(api: DockviewApi): void {
  // Default: 記事一覧/カテゴリツリー(左) + チャット(中央、広め) + プレビュー(右)
  api.addPanel({
    id: 'articles',
    component: 'articles',
    title: '記事一覧',
    initialWidth: 260,
  });

  api.addPanel({
    id: 'chat',
    component: 'chat',
    title: 'エージェントチャット',
    position: { referencePanel: 'articles', direction: 'right' },
    initialWidth: 500,
  });

  api.addPanel({
    id: 'preview',
    component: 'preview',
    title: '編集・プレビュー',
    position: { referencePanel: 'chat', direction: 'right' },
    initialWidth: 440,
  });
}

// ── Activity bar ──────────────────────────────────────────────────────────────

function updateActivityBar(): void {
  if (!dockviewApi) return;
  document.querySelectorAll<HTMLElement>('.activity-item[data-panel]').forEach(btn => {
    const panelId = btn.dataset.panel as PanelId;
    const panel = dockviewApi!.getPanel(panelId);
    btn.classList.toggle('active', !!panel);
  });
}

const PANEL_TITLES: Record<PanelId, string> = {
  articles: '記事一覧',
  chat: 'エージェントチャット',
  preview: '編集・プレビュー',
};

function togglePanel(panelId: PanelId): void {
  if (!dockviewApi) return;
  const panel = dockviewApi.getPanel(panelId);
  if (panel) {
    panel.api.close();
  } else {
    const panels = dockviewApi.panels;
    const addOpts: Parameters<DockviewApi['addPanel']>[0] = {
      id: panelId,
      component: panelId,
      title: PANEL_TITLES[panelId],
    };
    if (panels.length > 0) {
      addOpts.position = { referencePanel: panels[panels.length - 1].id, direction: 'right' };
    }
    dockviewApi.addPanel(addOpts);
  }
  updateActivityBar();
  saveLayout();
}

// ── Auth ──────────────────────────────────────────────────────────────────────

function updateAuthUI(loggedIn: boolean): void {
  const statusText = document.getElementById('auth-status-text')!;
  const btnLogin = document.getElementById('btn-login')!;
  const btnLogout = document.getElementById('btn-logout')!;
  const authBtn = document.getElementById('activity-auth')!;

  if (loggedIn) {
    statusText.textContent = 'ログイン済み';
    btnLogin.classList.add('hidden');
    btnLogout.classList.remove('hidden');
    authBtn.classList.add('active');
    const articlesEl = document.getElementById('panel-content-articles');
    if (articlesEl) void loadArticlesInElement(articlesEl);
  } else {
    statusText.textContent = '未ログイン';
    btnLogin.classList.remove('hidden');
    btnLogout.classList.add('hidden');
    authBtn.classList.remove('active');
  }
}

async function initAuth(): Promise<void> {
  const { loggedIn } = await window.takawasi.auth.check();
  updateAuthUI(loggedIn);

  window.takawasi.auth.onCompleted((data) => {
    updateAuthUI(data.loggedIn);
  });

  document.getElementById('btn-login')!.addEventListener('click', () => {
    void window.takawasi.auth.login();
  });

  document.getElementById('btn-logout')!.addEventListener('click', async () => {
    await window.takawasi.auth.logout();
    updateAuthUI(false);
  });

  document.getElementById('activity-auth')!.addEventListener('click', () => {
    const isLoggedIn = !document.getElementById('btn-logout')!.classList.contains('hidden');
    if (isLoggedIn) {
      void window.takawasi.auth.logout().then(() => updateAuthUI(false));
    } else {
      void window.takawasi.auth.login();
    }
  });
}

// ── Terminal ──────────────────────────────────────────────────────────────────

async function initTerminalInElement(root: HTMLElement, onFit: (fit: FitAddon) => void): Promise<void> {
  const term = new Terminal({
    theme: {
      background: '#000000',
      foreground: '#e8e8f5',
      cursor: '#60a5fa',
    },
    fontSize: 13,
    fontFamily: '"Cascadia Code", "Fira Code", "Consolas", monospace',
    cursorBlink: true,
  });

  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  onFit(fitAddon);

  const container = root.querySelector<HTMLElement>('#terminal-container')!;
  term.open(container);
  fitAddon.fit();

  const termId = 'main';
  window.takawasi.terminal.onData(termId, (data: string) => term.write(data));
  window.takawasi.terminal.onExit(termId, () => term.write('\r\n[プロセス終了]\r\n'));

  const result = await window.takawasi.terminal.create(termId);
  if (!result.ok) {
    term.write(`\r\nターミナル初期化エラー: ${result.error || 'unknown'}\r\n`);
    return;
  }

  term.onData((data: string) => { void window.takawasi.terminal.write(termId, data); });

  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => {
      fitAddon.fit();
      const cols = Math.max(40, Math.floor(container.clientWidth / 8));
      const rows = Math.max(4, Math.floor(container.clientHeight / 18));
      void window.takawasi.terminal.resize(termId, cols, rows);
    });
    ro.observe(container);
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('dockview-container')!;

  const api = buildDockview(container);
  dockviewApi = api;

  const restored = tryRestoreLayout(api);
  if (!restored) {
    addDefaultPanels(api);
  }

  api.onDidAddPanel((_p: IDockviewPanel) => { updateActivityBar(); saveLayout(); });
  api.onDidRemovePanel((_p: IDockviewPanel) => { updateActivityBar(); saveLayout(); });
  api.onDidLayoutChange(() => { saveLayout(); });

  updateActivityBar();

  // Activity bar panel toggles
  document.querySelectorAll<HTMLElement>('.activity-item[data-panel]').forEach(btn => {
    btn.addEventListener('click', () => {
      const panelId = btn.dataset.panel as PanelId;
      if ((PANEL_IDS as readonly string[]).includes(panelId)) {
        togglePanel(panelId);
      }
    });
  });

  await initAuth();
});
