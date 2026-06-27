import { useState, type ChangeEvent, type ReactNode, type Ref } from "react";

interface FileDropZoneProps {
  /** ドロップエリア上部に表示する説明文（複数行可） */
  description: ReactNode;
  /** ファイル選択ボタンのラベル */
  selectLabel: string;
  /** input[type=file] の accept 属性 */
  accept?: string;
  /** ファイルが選択された際の処理 */
  onFileSelect: (file: File) => void;
  /** 親から渡す input への ref（クリックでファイル選択を起動するため） */
  inputRef: Ref<HTMLInputElement>;
  /** 選択中ファイル名などの補足表示（任意） */
  children?: ReactNode;
}

/**
 * ドラッグ&ドロップ／クリックでのファイル選択に対応した共通ドロップエリア。
 * 埋め込みカード・抽出カードで重複していたドロップUIを共通化したもの。
 * input への参照は呼び出し元から ref として受け取り、元の実装と同じ
 * 「ドロップエリアのクリックで input.click() を呼ぶ」方式を維持する。
 */
function FileDropZone({
  description,
  selectLabel,
  accept,
  onFileSelect,
  inputRef,
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
      className={`mb-5 cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
        isDragging
          ? "border-emerald-500 bg-emerald-500/10"
          : "border-neutral-300 dark:border-neutral-600"
      }`}
    >
      {description}
      <label
        onClick={(e) => e.stopPropagation()}
        className="inline-block cursor-pointer rounded bg-neutral-300 px-4 py-2 text-sm text-neutral-800 hover:opacity-80 dark:bg-neutral-600 dark:text-neutral-200"
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
      {children}
    </div>
  );
}

export default FileDropZone;