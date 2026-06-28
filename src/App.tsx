import { useCallback, useState } from "react";
import EmbedCard from "./components/EmbedCard";
import ExtractCard from "./components/ExtractCard";
import PreviewModal from "./components/PreviewModal";
import type { AppMode } from "./types";

/** タブ切り替えのラベルとアイコンを定義する設定（拡張時はここに追加するだけでよい） */
const MODES: { id: AppMode; label: string; description: string }[] = [
  { id: "hide", label: "隠す", description: "画像にファイルを埋め込む" },
  { id: "reveal", label: "見つける", description: "画像からファイルを取り出す" },
];

function App() {
  const [mode, setMode] = useState<AppMode>("hide");

  // --- 拡大表示モーダル（埋め込み・抽出の両プレビューから共有するため親で保持） ---
  const [modalSrc, setModalSrc] = useState<string>("");

  const openModal = useCallback((src: string) => {
    if (!src) return;
    setModalSrc(src);
  }, []);

  const closeModal = useCallback(() => {
    setModalSrc("");
  }, []);

  return (
    <div className="min-h-screen bg-plate-50 text-plate-900 dark:bg-plate-950 dark:text-plate-100">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10 sm:px-6">
        {/* ヘッダー */}
        <header className="text-center">
          <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-plate-900 dark:bg-amber-500">
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-amber-400 dark:text-plate-950" fill="none">
              <rect x="3" y="3" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
              <circle cx="8.5" cy="9" r="1.4" fill="currentColor" />
              <path d="M3 14.5 8 10l3.5 3 3-2.5L21 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M9 21h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold tracking-tight">
            画像ステガノグラフィー
          </h1>
          <p className="mt-1 text-sm text-plate-500 dark:text-plate-400">
            画像の見た目を変えずに、ファイルを隠して取り出せます
          </p>
        </header>

        {/* モード切り替えタブ */}
        <nav
          role="tablist"
          aria-label="操作モード"
          className="flex gap-1 rounded-xl bg-plate-200/70 p-1 dark:bg-plate-800"
        >
          {MODES.map((m) => (
            <button
              key={m.id}
              role="tab"
              aria-selected={mode === m.id}
              onClick={() => setMode(m.id)}
              className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                mode === m.id
                  ? "bg-white text-plate-900 shadow-sm dark:bg-plate-700 dark:text-white"
                  : "text-plate-500 hover:text-plate-700 dark:text-plate-400 dark:hover:text-plate-200"
              }`}
            >
              {m.label}
            </button>
          ))}
        </nav>

        {/* アクティブなモードのカードのみ表示する（タブの最も標準的なUXに合わせる） */}
        {mode === "hide" ? (
          <EmbedCard onPreviewClick={openModal} />
        ) : (
          <ExtractCard onPreviewClick={openModal} />
        )}

        <footer className="pt-4 text-center text-xs text-plate-400 dark:text-plate-500">
          すべての処理はブラウザ内で行われ、ファイルは外部に送信されません
        </footer>
      </div>

      {/* 拡大表示モーダル */}
      <PreviewModal src={modalSrc} onClose={closeModal} />
    </div>
  );
}

export default App;