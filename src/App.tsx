import { useCallback, useState } from "react";
import EmbedCard from "./components/EmbedCard";
import ExtractCard from "./components/ExtractCard";
import PreviewModal from "./components/PreviewModal";

function App() {
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
    <div className="min-h-screen bg-neutral-50 p-5 text-neutral-800 dark:bg-neutral-900 dark:text-neutral-200">
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        <EmbedCard onPreviewClick={openModal} />
        <ExtractCard onPreviewClick={openModal} />
      </div>

      {/* 拡大表示モーダル */}
      <PreviewModal src={modalSrc} onClose={closeModal} />
    </div>
  );
}

export default App;