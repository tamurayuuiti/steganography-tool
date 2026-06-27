import { useCallback, useRef, useState } from "react";
import {
  extract,
  formatExtractedSize,
  getPreviewKind,
} from "../steganography";
import { useImageSource } from "../hooks/useImageSource";
import { useObjectUrls } from "../hooks/useObjectUrls";
import { useProgress } from "../hooks/useProgress";
import {
  formatImageDimensions,
  loadImageDimensions,
  readBlobAsText,
} from "../utils/imageFile";
import type { ExtractedFile, PreviewClickHandler } from "../types";
import FileDropZone from "./FileDropZone";
import ProgressBar from "./ProgressBar";

interface ExtractCardProps {
  /** プレビュー画像クリック時に拡大モーダルを開く */
  onPreviewClick: PreviewClickHandler;
}

/**
 * 「画像から埋め込まれたデータを抽出」カード。
 * 抽出用画像のアップロードから抽出実行、進捗表示、
 * 結果プレビュー（画像/音声/テキスト）・ダウンロードまでの責務を持つ。
 */
function ExtractCard({ onPreviewClick }: ExtractCardProps) {
  const {
    fileName: extractImageName,
    isLoaded: isExtractReady,
    canvasRef: extractCanvasRef,
    imageDataRef: extractImgDataRef,
    loadFile: loadExtractImage,
  } = useImageSource();

  // --- 抽出関連の状態 ---
  const { progress: extractProgress, start, update, stopRunning, reset } =
    useProgress();
  const [extractError, setExtractError] = useState<string>("");
  const [extractedFile, setExtractedFile] = useState<ExtractedFile | null>(
    null,
  );
  const [extractedImageDimensions, setExtractedImageDimensions] =
    useState<string>("");
  // プレビュー表示用のObject URL（画像・音声）
  const [extractedPreviewUrl, setExtractedPreviewUrl] = useState<string>("");
  // テキスト系ファイルのプレビュー内容
  const [extractedTextPreview, setExtractedTextPreview] = useState<string>("");

  const extractImageInputRef = useRef<HTMLInputElement>(null);
  const { createUrl, revokeAll } = useObjectUrls();

  // --- 抽出: 結果のリセット ---
  const resetExtractResults = useCallback(() => {
    reset();
    setExtractError("");
    setExtractedFile(null);
    setExtractedImageDimensions("");
    setExtractedPreviewUrl("");
    setExtractedTextPreview("");
    revokeAll();
  }, [reset, revokeAll]);

  // --- 抽出: 画像アップロード処理 ---
  const handleExtractImageUpload = useCallback(
    (file: File) => {
      resetExtractResults();
      void loadExtractImage(file);
    },
    [resetExtractResults, loadExtractImage],
  );

  // --- 抽出: 実行処理 ---
  const startExtraction = useCallback(async () => {
    const imgData = extractImgDataRef.current;
    if (!imgData) {
      alert("画像がアップロードされていません。");
      return;
    }

    start("データ抽出中");
    setExtractError("");

    try {
      const result = await extract(imgData.data, (percent) => {
        update({
          percent,
          message: percent === 100 ? "データ抽出完了" : "データ抽出中",
        });
      });

      setExtractedFile(result);
      stopRunning();

      // 抽出結果の形式に応じたプレビュー（画像/音声URL・テキスト内容・画像寸法）を生成する
      const kind = getPreviewKind(result.extension);

      if (kind === "image" || kind === "audio") {
        const objectUrl = createUrl(result.blob);
        setExtractedPreviewUrl(objectUrl);

        if (kind === "image") {
          const { width, height } = await loadImageDimensions(objectUrl);
          setExtractedImageDimensions(formatImageDimensions(width, height));
        }
      } else if (kind === "text") {
        const text = await readBlobAsText(result.blob);
        setExtractedTextPreview(text);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setExtractError(message);
      stopRunning();
      console.error(err);
    }
  }, [extractImgDataRef, start, update, stopRunning, createUrl]);

  // --- 抽出: ダウンロード処理 ---
  const downloadExtractedFile = useCallback(() => {
    if (!extractedFile) return;
    const link = document.createElement("a");
    const objectUrl = createUrl(extractedFile.blob);
    link.href = objectUrl;
    link.download = `${extractedFile.name}.${extractedFile.extension}`;
    link.click();
  }, [extractedFile, createUrl]);

  return (
    <div className="rounded-xl bg-white p-6 shadow-lg sm:p-8 dark:bg-neutral-800">
      <h3 className="mb-4 inline-block border-b-2 border-emerald-500 pb-1 text-xl font-semibold">
        画像から埋め込まれたデータを抽出
      </h3>

      {/* 抽出用画像ドロップエリア */}
      <FileDropZone
        description={
          <>
            <p className="pointer-events-none mb-2 text-neutral-600 dark:text-neutral-400">
              ここに画像をドラッグ＆ドロップしてください
            </p>
            <p className="pointer-events-none mb-2 text-sm text-neutral-500 dark:text-neutral-500">
              または
            </p>
          </>
        }
        selectLabel="画像を選択"
        accept="image/png, image/jpeg, image/heif"
        onFileSelect={handleExtractImageUpload}
        inputRef={extractImageInputRef}
      >
        {extractImageName && (
          <p className="pointer-events-none mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            {extractImageName}
          </p>
        )}
      </FileDropZone>

      {/* 抽出アクション */}
      <div>
        <button
          type="button"
          disabled={!isExtractReady || extractProgress.isRunning}
          onClick={startExtraction}
          className="mt-2 mr-2.5 rounded-md bg-emerald-500 px-6 py-3 text-base text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:hover:bg-neutral-300"
        >
          データを抽出する
        </button>
        {extractedFile && (
          <button
            type="button"
            onClick={downloadExtractedFile}
            className="mt-2 mr-2.5 rounded-md bg-emerald-500 px-6 py-3 text-base text-white transition-colors hover:bg-emerald-600"
          >
            抽出されたデータをダウンロード
          </button>
        )}
      </div>

      {/* 抽出進捗セクション */}
      <div>
        <ProgressBar progress={extractProgress} />

        {extractError && (
          <div className="mt-2.5 font-bold text-red-500">{extractError}</div>
        )}
      </div>

      {/* 抽出されたファイル情報 */}
      {extractedFile && (
        <div className="mt-5 text-sm text-neutral-600 dark:text-neutral-400">
          ファイル名: {extractedFile.name}.{extractedFile.extension}、容量:{" "}
          {formatExtractedSize(extractedFile.blob.size)}
          {extractedImageDimensions && `、サイズ: ${extractedImageDimensions}`}
        </div>
      )}

      {/* 抽出データのプレビュー */}
      {extractedFile && (
        <div className="mt-5 text-center">
          <p className="mb-2 text-neutral-600 dark:text-neutral-400">
            抽出されたデータ:
          </p>
          {getPreviewKind(extractedFile.extension) === "image" &&
            extractedPreviewUrl && (
              <img
                src={extractedPreviewUrl}
                onClick={() => onPreviewClick(extractedPreviewUrl)}
                alt="抽出された画像のプレビュー"
                className="mx-auto max-h-75 max-w-full cursor-zoom-in rounded bg-neutral-500 object-contain"
              />
            )}
          {getPreviewKind(extractedFile.extension) === "audio" &&
            extractedPreviewUrl && (
              <audio controls src={extractedPreviewUrl} className="w-full" />
            )}
          {getPreviewKind(extractedFile.extension) === "text" && (
            <div className="mx-auto h-100 w-full overflow-y-scroll rounded border border-neutral-300 bg-neutral-50 p-2.5 text-left whitespace-pre-wrap dark:border-neutral-600 dark:bg-neutral-900">
              {extractedTextPreview}
            </div>
          )}
          {getPreviewKind(extractedFile.extension) === "unsupported" && (
            <p className="font-bold">
              この形式のプレビューはできません。ファイル形式:{" "}
              {extractedFile.extension}
            </p>
          )}
        </div>
      )}

      {/* 抽出処理用の非表示Canvas */}
      <canvas ref={extractCanvasRef} className="hidden" />
    </div>
  );
}

export default ExtractCard;