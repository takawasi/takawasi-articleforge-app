# Takawasi ArticleForge App

ArticleForge 専用デスクトップアプリ。記事をエージェントと一緒に書く。

> DL → ログイン → エージェントチャット。それだけで記事執筆が完結。

## ダウンロード / Download

**[GitHub Releases](https://github.com/takawasi/takawasi-articleforge-app/releases/latest)**

| OS | ファイル |
|---|---|
| macOS Apple Silicon | `Takawasi-ArticleForge-App-mac-arm64.dmg` |
| macOS Intel | `Takawasi-ArticleForge-App-mac-x64.dmg` |
| Windows | `Takawasi-ArticleForge-App-win-x64.exe` (NSIS installer) |
| Linux | `Takawasi-ArticleForge-App-linux-x64.AppImage` |

### 初回起動の注意 / First Launch

**macOS（Gatekeeper 警告）**

```bash
xattr -d com.apple.quarantine "/Applications/Takawasi ArticleForge App.app"
```

または「システム設定」→「プライバシーとセキュリティ」→「このまま開く」でも起動可。

**Windows（SmartScreen 警告）**

「詳細情報」→「実行」をクリック。

コードサイニング証明書なしの OSS 配布です。

---

## 機能 / Features

- **記事一覧（左パネル）**: ArticleForge の全記事をカテゴリ/タグ階層で表示
- **エージェントチャット（中央パネル）**: TBA による ArticleForge 専用ルーティング（service="articleforge" 固定）
- **編集・プレビュー（右パネル）**: 選択した記事を ArticleForge Web エディタで iframe 表示
- **1回ログイン**: CreditGate（Google OAuth）で1回認証すれば全 API 自動通過
- dockview で各パネルを自由にリサイズ・並べ替え可能

---

## ビルド手順 / Build

```bash
# 依存インストール（node-pty を electron に合わせてリビルド）
npm install

# 開発実行（WSL2 では Electron GUI 起動不可、typecheck + build まで）
npm run typecheck
npm run build

# 配布バイナリ生成（release/ に Takawasi-ArticleForge-App-<os>-<arch>.* を出力）
npm run dist          # 全OS
npm run dist:mac      # mac のみ
npm run dist:win      # Windows のみ
npm run dist:linux    # Linux のみ
```

**前提**

- Node.js 18+
- Python 3（node-pty native build 用）
- macOS: Xcode Command Line Tools
- Windows: node-gyp / windows-build-tools

---

## 開発環境セットアップ / Development

```bash
git clone https://github.com/takawasi/takawasi-articleforge-app.git
cd takawasi-articleforge-app
npm install
npm run dev
```

**ディレクトリ構造**

```
src/
  main/index.ts      # Electron main process（IPC・ArticleForge API プロキシ・OAuth）
  preload/index.ts   # contextBridge 公開 API（auth/tba/articleforge/terminal/shell）
  renderer/
    index.html       # メイン画面（記事一覧 + チャット + プレビュー 3パネル）
    styles.css       # UI スタイル
    app.ts           # renderer ロジック（dockview・IPC受信・記事一覧・カテゴリ）
  cli/index.ts       # CLI エントリポイント（継承済み）
assets/              # アプリアイコン等
electron-builder.yml # パッケージング設定
```

**設計方針**

- ArticleForge API は全て main process IPC 経由でプロキシ（Cookie/CORS 問題回避）
- TBA SSE は service="articleforge" 固定（main process で設定、renderer から変更不可）
- Electron セキュリティ: contextIsolation=true / nodeIntegration=false / sandbox=true / CSP
- カテゴリ単一階層 + タグ多重モデル（WordPress ライク）

---

## GitHub Releases への公開手順

1. タグ `v0.1.0` を push
2. `.github/workflows/release.yml` が各 OS バイナリを生成し GitHub Releases に自動アップロード

---

## 関連リンク / Links

- [ArticleForge Web 版](https://articleforge.takawasi-social.com)
- [CreditGate（認証）](https://creditgate.takawasi-social.com)
- [takawasi-desktop（統合版）](https://github.com/takawasi/takawasi-desktop)

---

## ライセンス / License

MIT License — Copyright 2026 takawasi

---

## 事業者様 — LLM 統合・AI 開発のご相談 / For Businesses — LLM & AI Development Consultation

**格安で、質が高い。 / Affordable, high quality.**

LLM エージェント（TBA）、デスクトップアプリ、コンテンツ生成、決済基盤、MCP サーバ等の統合開発をご検討の事業者様、初回相談無料です。

We offer free initial consultations for businesses considering LLM agents (TBA), desktop apps, content generation, payment infrastructure, MCP servers, and more.

- 無料相談フォーム / Free consultation form: <https://takawasi-social.com/consultation/>
- X (旧 Twitter) DM: [@takawasi_heintz](https://x.com/takawasi_heintz)
