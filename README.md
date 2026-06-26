# react-template

個人開発向けの React テンプレートリポジトリです。

React + TypeScript + Vite + Tailwind CSS v4 をベースに、軽量かつ拡張しやすい構成を提供します。

---

## 技術スタック

- React
- TypeScript
- Vite
- Tailwind CSS v4
- ESLint

---

## ディレクトリ構成

```text
src/
├── components/   # UIコンポーネント
├── lib/          # 共通処理・ユーティリティ
````

※必要に応じて以下を追加可能

* pages/
* layouts/

---

## セットアップ

### 1. テンプレートから作成

GitHub の "Use this template" を使用して新規リポジトリを作成します。

### 2. クローン

```bash
git clone <repository-url>
cd <project-name>
npm install
npm run dev
```

デフォルト：

```text
http://localhost:5173
```

---

## ビルド

```bash
npm run build
```

出力先：

```text
dist/
```

---

## デプロイ

Vercel などの静的ホスティングサービスに対応しています。

GitHub と連携することで、自動ビルド・自動デプロイが可能です。

---

## 開発メモ

* パスエイリアス `@` を利用する
* 共通処理は `src/lib` に集約する
* UI コンポーネントは `src/components` に配置する
* 依存関係は必要最小限に保つ
* ビルド成果物（`dist/`）は直接編集しない
* archive/ は旧コードや実験的実装の退避に使用する
* notes/ は設計メモ・思考ログに使用する