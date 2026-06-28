import { useState, type ChangeEvent, type ReactNode, type Ref } from "react";

interface FileDropZoneProps {
  /** ドロップエリア上部に表示するタイトル */
  title: string;
  /** 補足説明 */
  hint?: string;
  /** ファイル選択ボタンのラベル */
  selectLabel: string;
  /** input[type=file] の accept 属性 */
  accept?: string;
  /** ファイルが選択された際の処理 */
  onFileSelect: (file: File) => void;
  /** 親から渡す input への ref（クリックでファイル選択を起動するため） */
  inputRef: Ref<HTMLInputElement>;
  /** ファイル選択済みかどうか（見た目をコンパクトな「選択済み」表示に切り替える） */
  isFilled?: boolean;
  /** 選択中ファイル名などの補足表示（任意） */
  children?: ReactNode;
}

/** フォルダ＋矢印アイコン（アップロードの意図を示す最小限のグラフィック） */
function UploadGlyph({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={`h-10 w-10 transition-colors ${
        active ? "text-amber-500" : "text-plate-400 dark:text-plate-500"
      }`}
      fill="none"
    >
      <path
        d="M10 30v6a4 4 0 0 0 4 4h20a4 4 0 0 0 4-4v-6"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M24 28V8m0 0-7 7m7-7 7 7"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * ドラッグ&ドロップ／クリックでのファイル選択に対応した共通ドロップエリア。
 * 「未選択」と「選択済み」で見た目を切り替え、選択後はコンパクトな確認表示にする。
 */
function FileDropZone({
  title,
  hint,
  selectLabel,
  accept,
  onFileSelect,
  inputRef,
  isFilled = false,
  children,
}: FileDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleClickInput = () => {
    if (inputRef && typeof inputRef === "object" && inputRef.current) {
      inputRef.current.click();
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileSelect(file);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) onFileSelect(file);
      }}
      onClick={handleClickInput}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") handleClickInput();
      }}
      className={`group cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-all duration-150 ${
        isDragging
          ? "border-amber-500 bg-amber-500/8 scale-[1.01]"
          : isFilled
            ? "border-plate-200 bg-plate-50 dark:border-plate-600 dark:bg-plate-800"
            : "border-plate-300 hover:border-plate-400 hover:bg-plate-50 dark:border-plate-600 dark:hover:border-plate-500 dark:hover:bg-plate-800/60"
      }`}
    >
      <div className="flex flex-col items-center gap-2">
        <UploadGlyph active={isDragging} />
        <p className="pointer-events-none text-sm font-medium text-plate-700 dark:text-plate-200">
          {title}
        </p>
        {hint && (
          <p className="pointer-events-none text-xs text-plate-500 dark:text-plate-400">
            {hint}
          </p>
        )}
        <label
          onClick={(e) => e.stopPropagation()}
          className="mt-2 inline-block cursor-pointer rounded-lg bg-plate-900 px-4 py-2 text-xs font-medium text-white transition-opacity hover:opacity-85 dark:bg-amber-500 dark:text-plate-950"
        >
          {selectLabel}
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={handleChange}
          />
        </label>
      </div>
      {children}
    </div>
  );
}

export default FileDropZone;