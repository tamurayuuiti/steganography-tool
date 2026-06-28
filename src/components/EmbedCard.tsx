import { useCallback, useRef, useState } from "react";
import {
  calcMaxDataBytes,
  ensureCapacity,
  embed,
  verify,
  formatBytes,
  isValidImage,
  encodeUtf8,
} from "../steganography";
import { useImageSource } from "../hooks/useImageSource";
import { useProgress } from "../hooks/useProgress";
import { useStopwatch } from "../hooks/useStopwatch";
import type { PreviewClickHandler, TargetFileInfo } from "../types";
import FileDropZone from "./FileDropZone";
import ProgressBar from "./ProgressBar";

interface EmbedCardProps {
  /** プレビュー画像クリック時に拡大モーダルを開く */
  onPreviewClick: PreviewClickHandler;
}

/**
 * 「画像にファイルを埋め込む」カード。
 * 画像・対象ファイルのアップロードから埋め込み実行、進捗表示、
 * 結果プレビュー・ダウンロードまでの一連の責務を持つ。
 */
function EmbedCard({ onPreviewClick }: EmbedCardProps) {
  // --- 画像関連の状態 ---
  const [originalPreviewSrc, setOriginalPreviewSrc] = useState<string>("");
  const [maxDataBytes, setMaxDataBytes] = useState<number>(0);

  const {
    fileName: imageFileName,
    isLoaded: isSourceImageLoaded,
    canvasRef,
    imageDataRef: imgDataRef,
    loadFile: loadSourceImage,
  } = useImageSource({
    validate: isValidImage,
    validationErrorMessage:
      "対応していない画像形式です。PNG, JPG, HEIFを使用してください。",
    onLoaded: (dataUrl, imgData) => {
      setOriginalPreviewSrc(dataUrl);
      setMaxDataBytes(calcMaxDataBytes(imgData.width, imgData.height));
    },
  });

  // --- 埋め込み対象ファイルの状態 ---
  const [targetFile, setTargetFile] = useState<File | null>(null);
  const [targetFileInfo, setTargetFileInfo] = useState<TargetFileInfo | null>(
    null,
  );

  // --- 進捗・結果の状態 ---
  const { progress, start, updatePercent, updateMessage, finish, stopRunning, reset } =
    useProgress();
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [outputPreviewSrc, setOutputPreviewSrc] = useState<string>("");
  const { elapsedTime, start: startStopwatch, stop: stopStopwatch } =
    useStopwatch();

  // --- DOM操作が必須な箇所のみ ref で保持 ---
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const originalFileNameRef = useRef<string>("");

  // 新しい入力があった際に前回の処理結果・エラー表示をリセットする
  const resetResults = useCallback(() => {
    setOutputPreviewSrc("");
    setErrorMessage("");
    reset();
  }, [reset]);

  // --- 画像アップロード処理 ---
  const handleImageUpload = useCallback(
    (file: File) => {
      resetResults();
      originalFileNameRef.current = file.name;
      void loadSourceImage(file);
    },
    [resetResults, loadSourceImage],
  );

  // --- 埋め込み対象ファイルのアップロード処理 ---
  const handleFileUpload = useCallback((file: File) => {
    setTargetFile(file);
    setTargetFileInfo({ name: file.name, size: file.size, type: file.type });
  }, []);

  // 埋め込み可能容量を超えているかどうか
  const isOverCapacity = targetFile !== null && targetFile.size > maxDataBytes;
  const isEmbedReady =
    isSourceImageLoaded && targetFile !== null && !isOverCapacity;

  // --- 埋め込み実行処理 ---
  const startEmbedding = useCallback(async () => {
    const imgData = imgDataRef.current;
    if (!imgData || !targetFile) return;

    start("データ埋め込み中...");
    setErrorMessage("");
    startStopwatch();

    try {
      // 1. ファイルをArrayBufferとして読み込む
      const fileBuffer = await targetFile.arrayBuffer();
      const fileBytes = new Uint8Array(fileBuffer);

      // 2. メタデータの作成
      // 構造: [NameLen(16bit)][NameBytes][DataLen(32bit)][DataBytes]
      const fileNameBytes = encodeUtf8(targetFile.name);

      ensureCapacity(
        imgData.width,
        imgData.height,
        fileNameBytes.length,
        fileBytes.length,
      );

      // 3. 埋め込み処理 (Chunking for UI responsiveness)
      await embed(imgData.data, fileNameBytes, fileBytes, updatePercent);

      // 4. 検証 (埋め込んだデータを読み出して比較)
      updateMessage("データ検証中...");
      await verify(imgData.data, fileNameBytes, fileBytes, updatePercent);

      // 5. 完了処理
      stopStopwatch();
      finish("完了");

      // 結果をCanvasに反映してプレビュー表示
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
        ctx.putImageData(imgData, 0, 0);
        setOutputPreviewSrc(canvas.toDataURL());
      }
    } catch (err) {
      stopStopwatch();
      const message = err instanceof Error ? err.message : String(err);
      setErrorMessage(message);
      stopRunning();
      console.error(err);
    }
  }, [
    targetFile,
    imgDataRef,
    canvasRef,
    start,
    updatePercent,
    updateMessage,
    finish,
    stopRunning,
    startStopwatch,
    stopStopwatch,
  ]);

  // --- ダウンロード処理 ---
  const downloadImage = useCallback(() => {
    if (!outputPreviewSrc) return;
    const link = document.createElement("a");
    const baseName = originalFileNameRef.current.split(".")[0];
    link.download = `stego_${baseName}.png`;
    link.href = outputPreviewSrc;
    link.click();
  }, [outputPreviewSrc]);

  // 容量情報は画像読み込み後のみ表示する
  const showCapacityInfo = maxDataBytes > 0;

  return (
    <div className="rounded-xl bg-white p-6 shadow-lg sm:p-8 dark:bg-neutral-800">
      <h3 className="mb-4 inline-block border-b-2 border-emerald-500 pb-1 text-xl font-semibold">
        画像にファイルを埋め込む
      </h3>

      {/* 画像ドロップエリア */}
      <FileDropZone
        description={
          <p className="pointer-events-none mb-2 text-neutral-600 dark:text-neutral-400">
            1. ここに画像 (PNG/JPG) をドラッグ＆ドロップ
          </p>
        }
        selectLabel="画像を選択"
        accept="image/png, image/jpeg, image/heif"
        onFileSelect={handleImageUpload}
        inputRef={imageInputRef}
      >
        {imageFileName && (
          <p className="pointer-events-none mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            {imageFileName}
          </p>
        )}
      </FileDropZone>

      {/* 隠したいファイルのドロップエリア */}
      <FileDropZone
        description={
          <p className="pointer-events-none mb-2 text-neutral-600 dark:text-neutral-400">
            2. ここに隠したいファイルをドラッグ＆ドロップ
          </p>
        }
        selectLabel="ファイルを選択"
        onFileSelect={handleFileUpload}
        inputRef={fileInputRef}
      >
        {targetFileInfo && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2.5 rounded-lg bg-neutral-500/5 p-4 text-left text-sm"
          >
            <div>
              <strong className="text-neutral-800 dark:text-neutral-200">
                ファイル名:
              </strong>{" "}
              {targetFileInfo.name}
            </div>
            <div>
              <strong className="text-neutral-800 dark:text-neutral-200">
                サイズ:
              </strong>{" "}
              {formatBytes(targetFileInfo.size)}
            </div>
            <div>
              <strong className="text-neutral-800 dark:text-neutral-200">
                形式:
              </strong>{" "}
              {targetFileInfo.type || "不明"}
            </div>
          </div>
        )}
      </FileDropZone>

      {/* アクションエリア */}
      <div>
        {showCapacityInfo && (
          <p className="my-2 text-neutral-600 dark:text-neutral-400">
            埋め込み可能容量:{" "}
            <strong className="text-emerald-500">
              {formatBytes(maxDataBytes)}
            </strong>{" "}
            (ファイル: {targetFile ? formatBytes(targetFile.size) : "0 B"})
            {isOverCapacity && (
              <>
                <br />
                <span className="font-bold text-red-500">
                  ⚠ 容量オーバーです。より大きな画像を使用してください。
                </span>
              </>
            )}
          </p>
        )}

        <button
          type="button"
          disabled={!isEmbedReady || progress.isRunning}
          onClick={startEmbedding}
          className="mt-2 mr-2.5 rounded-md bg-emerald-500 px-6 py-3 text-base text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:hover:bg-neutral-300"
        >
          データを埋め込む
        </button>
        {outputPreviewSrc && (
          <button
            type="button"
            onClick={downloadImage}
            className="mt-2 mr-2.5 rounded-md bg-emerald-500 px-6 py-3 text-base text-white transition-colors hover:bg-emerald-600"
          >
            画像をダウンロード
          </button>
        )}
      </div>

      {/* 進捗セクション */}
      <div>
        <ProgressBar progress={progress} elapsedTime={elapsedTime} />

        {errorMessage && (
          <div className="mt-2.5 font-bold text-red-500">{errorMessage}</div>
        )}
      </div>

      {/* プレビューセクション */}
      <div className="mt-8 flex flex-wrap justify-around gap-5">
        {originalPreviewSrc && (
          <div className="min-w-65 flex-1 rounded-lg border border-neutral-300 p-2.5 text-center dark:border-neutral-600">
            <p className="text-neutral-600 dark:text-neutral-400">元画像</p>
            <img
              src={originalPreviewSrc}
              onClick={() => onPreviewClick(originalPreviewSrc)}
              alt="元画像のプレビュー"
              className="mt-2.5 max-h-75 max-w-full cursor-zoom-in rounded bg-neutral-500 object-contain"
            />
          </div>
        )}
        {outputPreviewSrc && (
          <div className="min-w-65 flex-1 rounded-lg border border-neutral-300 p-2.5 text-center dark:border-neutral-600">
            <p className="text-neutral-600 dark:text-neutral-400">
              埋め込み後
            </p>
            <img
              src={outputPreviewSrc}
              onClick={() => onPreviewClick(outputPreviewSrc)}
              alt="埋め込み後画像のプレビュー"
              className="mt-2.5 max-h-75 max-w-full cursor-zoom-in rounded bg-neutral-500 object-contain"
            />
          </div>
        )}
      </div>

      {/* 画像処理用の非表示Canvas */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

export default EmbedCard;