interface PreviewModalProps {
  /** 表示する画像のsrc。空文字なら非表示 */
  src: string;
  onClose: () => void;
}

/** 画像クリック時の拡大表示モーダル（埋め込み・抽出の両プレビューから共有） */
function PreviewModal({ src, onClose }: PreviewModalProps) {
  if (!src) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
    >
      <img
        src={src}
        alt="拡大画像"
        className="max-h-[95%] max-w-[95%] shadow-[0_0_20px_rgba(255,255,255,0.2)]"
      />
    </div>
  );
}

export default PreviewModal;