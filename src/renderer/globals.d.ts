// Global type declarations for the renderer process
// window.takawasi is injected by contextBridge in preload/index.ts

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

interface ArticleForgeApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  status?: number;
}

interface TakawasiAPI {
  auth: {
    check: () => Promise<{ loggedIn: boolean }>;
    login: () => Promise<{ ok: boolean }>;
    logout: () => Promise<{ ok: boolean }>;
    onCompleted: (cb: (data: { loggedIn: boolean }) => void) => void;
  };
  tba: {
    start: (id: string, message: string) => Promise<{ ok: boolean; error?: string }>;
    cancel: (id: string) => Promise<{ ok: boolean }>;
    onChunk: (id: string, cb: (chunk: string) => void) => void;
    onError: (id: string, cb: (data: { status?: number; message: string }) => void) => void;
    onEnd: (id: string, cb: () => void) => void;
    removeListeners: (id: string) => void;
  };
  terminal: {
    create: (id: string) => Promise<{ ok: boolean; error?: string }>;
    write: (id: string, data: string) => Promise<{ ok: boolean }>;
    resize: (id: string, cols: number, rows: number) => Promise<{ ok: boolean }>;
    destroy: (id: string) => Promise<{ ok: boolean }>;
    onData: (id: string, cb: (data: string) => void) => void;
    onExit: (id: string, cb: () => void) => void;
    removeListeners: (id: string) => void;
  };
  articleforge: {
    listDocs: () => Promise<ArticleForgeApiResponse<{ docs: ArticleDocSummary[] }>>;
    listCategories: () => Promise<ArticleForgeApiResponse<{ categories: CategoryMetadata[] }>>;
    createCategory: (name: string) => Promise<ArticleForgeApiResponse<{ category_id: string }>>;
    listByCategory: (categoryId: string) => Promise<ArticleForgeApiResponse<{ docs: ArticleDocSummary[] }>>;
    listByTag: (tag: string) => Promise<ArticleForgeApiResponse<{ docs: ArticleDocSummary[] }>>;
    updateTags: (docId: string, tags: string[]) => Promise<ArticleForgeApiResponse<{ status: string }>>;
    newDoc: (title: string) => Promise<ArticleForgeApiResponse<{ doc_id: string }>>;
  };
  shell: {
    openExternal: (url: string) => Promise<{ ok: boolean }>;
  };
}

interface Window {
  takawasi: TakawasiAPI;
}
