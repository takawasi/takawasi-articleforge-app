import { contextBridge, ipcRenderer } from 'electron';

// Expose only required APIs to renderer — contextIsolation enforced
contextBridge.exposeInMainWorld('takawasi', {
  // Auth
  auth: {
    check: () => ipcRenderer.invoke('auth:check'),
    login: () => ipcRenderer.invoke('auth:login'),
    logout: () => ipcRenderer.invoke('auth:logout'),
    onCompleted: (cb: (data: { loggedIn: boolean }) => void) => {
      ipcRenderer.on('auth:completed', (_e, data) => cb(data));
    },
  },
  // TBA — service="articleforge" fixed in main process
  tba: {
    start: (id: string, message: string) => ipcRenderer.invoke('tba:start', { id, message }),
    cancel: (id: string) => ipcRenderer.invoke('tba:cancel', { id }),
    onChunk: (id: string, cb: (chunk: string) => void) => {
      ipcRenderer.on(`tba:chunk:${id}`, (_e, chunk) => cb(chunk));
    },
    onError: (id: string, cb: (data: { status?: number; message: string }) => void) => {
      ipcRenderer.on(`tba:error:${id}`, (_e, data) => cb(data));
    },
    onEnd: (id: string, cb: () => void) => {
      ipcRenderer.on(`tba:end:${id}`, () => cb());
    },
    removeListeners: (id: string) => {
      ipcRenderer.removeAllListeners(`tba:chunk:${id}`);
      ipcRenderer.removeAllListeners(`tba:error:${id}`);
      ipcRenderer.removeAllListeners(`tba:end:${id}`);
    },
  },
  // Terminal
  terminal: {
    create: (id: string) => ipcRenderer.invoke('terminal:create', { id }),
    write: (id: string, data: string) => ipcRenderer.invoke('terminal:write', { id, data }),
    resize: (id: string, cols: number, rows: number) => ipcRenderer.invoke('terminal:resize', { id, cols, rows }),
    destroy: (id: string) => ipcRenderer.invoke('terminal:destroy', { id }),
    onData: (id: string, cb: (data: string) => void) => {
      ipcRenderer.on(`terminal:data:${id}`, (_e, data) => cb(data));
    },
    onExit: (id: string, cb: () => void) => {
      ipcRenderer.on(`terminal:exit:${id}`, () => cb());
    },
    removeListeners: (id: string) => {
      ipcRenderer.removeAllListeners(`terminal:data:${id}`);
      ipcRenderer.removeAllListeners(`terminal:exit:${id}`);
    },
  },
  // ArticleForge API (proxied via main to avoid CORS/Cookie issues)
  articleforge: {
    listDocs: () => ipcRenderer.invoke('af:listDocs'),
    listCategories: () => ipcRenderer.invoke('af:listCategories'),
    createCategory: (name: string) => ipcRenderer.invoke('af:createCategory', { name }),
    listByCategory: (categoryId: string) => ipcRenderer.invoke('af:listByCategory', { categoryId }),
    listByTag: (tag: string) => ipcRenderer.invoke('af:listByTag', { tag }),
    updateTags: (docId: string, tags: string[]) => ipcRenderer.invoke('af:updateTags', { docId, tags }),
    newDoc: (title: string) => ipcRenderer.invoke('af:newDoc', { title }),
  },
  // Shell
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', { url }),
  },
});
