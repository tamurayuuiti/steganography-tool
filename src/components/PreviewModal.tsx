import { useEffect } from "react";

interface PreviewModalProps {
  /** 表示する画像のsrc。空文字なら非表示 */
  src: string;
  /** 画像の説明（任意。「元画像」「埋め込み後」などの見出し） */
  caption?: string;
  onClose: () => void;
}

/** 画像クリック時の拡大表示モーダル（埋め込み・抽出の両プレビューから共有） */
function PreviewModal({ src, caption, onClose }: PreviewModalProps) {
  useEffect(() => {
    if (!src) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [src, onClose]);

  if (!src) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-plate-950/90 p-6 backdrop-blur-sm"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="閉じる"
        className="absolute top-5 right-5 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
          <path
            d="M6 6l12 12M18 6 6 18"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <img
        src={src}
        alt={caption ?? "拡大画像"}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] max-w-full cursor-default rounded-lg shadow-[0_0_40px_rgba(0,0,0,0.5)]"
      />
      {caption && (
        <p className="text-sm font-medium text-white/70">{caption}</p>
      )}
    </div>
  );
}

export default PreviewModal;