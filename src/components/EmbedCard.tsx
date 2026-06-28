import { useCallback, useMemo, useRef, useState } from "react";
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
import { Alert, Badge, Button, Card, SectionLabel, StepDots } from "./ui";

interface EmbedCardProps {
  /** プレビュー画像クリック時に拡大モーダルを開く */
  onPreviewClick: PreviewClickHandler;
}

/**
 * 「隠す」フロー。画像選択 → 対象ファイル選択 → 実行 → 結果、という
 * 自然な3ステップで進行する。各ステップの達成状況に応じて
 * 次のステップの強調表示・StepDotsが進む。
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
    resetResults();
    setTargetFile(file);
    setTargetFileInfo({ name: file.name, size: file.size, type: file.type });
  }, [resetResults]);

  // 埋め込み可能容量を超えているかどうか
  const isOverCapacity = targetFile !== null && targetFile.size > maxDataBytes;
  const isEmbedReady =
    isSourceImageLoaded && targetFile !== null && !isOverCapacity;

  // 現在の到達ステップ（StepDots表示用）: 1=画像待ち 2=ファイル待ち 3=実行可能/完了
  const currentStep = useMemo(() => {
    if (outputPreviewSrc) return 3;
    if (isSourceImageLoaded && targetFile) return 2;
    if (isSourceImageLoaded) return 1;
    return 0;
  }, [isSourceImageLoaded, targetFile, outputPreviewSrc]);

  // 容量使用率（メーター表示用、0-100にクランプ）
  const capacityUsagePercent =
    maxDataBytes > 0 && targetFile
      ? Math.min((targetFile.size / maxDataBytes) * 100, 100)
      : 0;

  // --- 埋め込み実行処理 ---
  const startEmbedding = useCallback(async () => {
    const imgData = imgDataRef.current;
    if (!imgData || !targetFile) return;

    start("データを埋め込んでいます...");
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
      updateMessage("正しく埋め込まれたか検証しています...");
      await verify(imgData.data, fileNameBytes, fileBytes, updatePercent);

      // 5. 完了処理
      stopStopwatch();
      finish("埋め込みが完了しました");

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

  return (
    <Card className="p-6 sm:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-plate-900 dark:text-white">
            画像にファイルを隠す
          </h2>
          <p className="mt-0.5 text-sm text-plate-500 dark:text-plate-400">
            画像を選び、隠したいファイルを重ねます
          </p>
        </div>
        <StepDots total={3} current={currentStep} />
      </div>

      <div className="space-y-5">
        {/* ステップ1: 画像 */}
        <section>
          <SectionLabel index={1}>もとになる画像</SectionLabel>
          <FileDropZone
            title={
              isSourceImageLoaded
                ? "別の画像に変更する"
                : "画像をドラッグ＆ドロップ"
            }
            hint="PNG・JPG・HEIF に対応"
            selectLabel="画像を選択"
            accept="image/png, image/jpeg, image/heif"
            onFileSelect={handleImageUpload}
            inputRef={imageInputRef}
            isFilled={isSourceImageLoaded}
          >
            {imageFileName && (
              <p className="pointer-events-none mt-3 text-xs font-medium text-plate-600 dark:text-plate-300">
                {imageFileName.replace("選択中: ", "")}
              </p>
            )}
          </FileDropZone>
        </section>

        {/* ステップ2: 対象ファイル */}
        <section
          className={
            isSourceImageLoaded ? "" : "pointer-events-none opacity-40"
          }
        >
          <SectionLabel index={2}>隠したいファイル</SectionLabel>
          <FileDropZone
            title={targetFile ? "別のファイルに変更する" : "ファイルをドラッグ＆ドロップ"}
            hint="どの形式のファイルでも隠せます"
            selectLabel="ファイルを選択"
            onFileSelect={handleFileUpload}
            inputRef={fileInputRef}
            isFilled={targetFile !== null}
          >
            {targetFileInfo && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="mt-4 flex flex-wrap items-center justify-center gap-2 text-left text-xs"
              >
                <Badge>{targetFileInfo.name}</Badge>
                <Badge>{formatBytes(targetFileInfo.size)}</Badge>
                <Badge>{targetFileInfo.type || "形式不明"}</Badge>
              </div>
            )}
          </FileDropZone>

          {/* 容量メーター */}
          {maxDataBytes > 0 && targetFile && (
            <div className="mt-3 rounded-lg bg-plate-50 px-3.5 py-3 dark:bg-plate-800/60">
              <div className="flex items-center justify-between text-xs">
                <span className="text-plate-600 dark:text-plate-400">
                  容量使用率
                </span>
                <span
                  className={`font-mono font-medium ${
                    isOverCapacity
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-plate-700 dark:text-plate-300"
                  }`}
                >
                  {formatBytes(targetFile.size)} / {formatBytes(maxDataBytes)}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-plate-200 dark:bg-plate-700">
                <div
                  className={`h-full rounded-full transition-all ${
                    isOverCapacity ? "bg-rose-500" : "bg-amber-500"
                  }`}
                  style={{ width: `${capacityUsagePercent}%` }}
                />
              </div>
            </div>
          )}

          {isOverCapacity && (
            <div className="mt-2.5">
              <Alert tone="rose">
                容量オーバーです。より大きな画像を使用するか、ファイルを圧縮してください。
              </Alert>
            </div>
          )}
        </section>

        {/* ステップ3: 実行・結果 */}
        <section className="border-t border-plate-100 pt-5 dark:border-plate-700">
          <Button
            size="lg"
            disabled={!isEmbedReady || progress.isRunning}
            onClick={startEmbedding}
            className="w-full"
          >
            {progress.isRunning ? "処理中..." : "データを埋め込む"}
          </Button>

          <ProgressBar progress={progress} elapsedTime={elapsedTime} />

          {errorMessage && (
            <div className="mt-3">
              <Alert tone="rose">{errorMessage}</Alert>
            </div>
          )}

          {outputPreviewSrc && (
            <div className="mt-3">
              <Alert tone="teal">
                埋め込みと検証が完了しました。画像を保存できます。
              </Alert>
            </div>
          )}
        </section>

        {/* プレビューセクション */}
        {(originalPreviewSrc || outputPreviewSrc) && (
          <section className="grid gap-4 sm:grid-cols-2">
            {originalPreviewSrc && (
              <div className="rounded-xl border border-plate-200 p-3 text-center dark:border-plate-700">
                <p className="text-xs font-medium text-plate-500 dark:text-plate-400">
                  元画像
                </p>
                <img
                  src={originalPreviewSrc}
                  onClick={() => onPreviewClick(originalPreviewSrc)}
                  alt="元画像のプレビュー"
                  className="mt-2 max-h-56 w-full cursor-zoom-in rounded-lg bg-plate-100 object-contain dark:bg-plate-800"
                />
              </div>
            )}
            {outputPreviewSrc && (
              <div className="rounded-xl border border-amber-300/60 bg-amber-500/5 p-3 text-center dark:border-amber-500/30">
                <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                  埋め込み後
                </p>
                <img
                  src={outputPreviewSrc}
                  onClick={() => onPreviewClick(outputPreviewSrc)}
                  alt="埋め込み後画像のプレビュー"
                  className="mt-2 max-h-56 w-full cursor-zoom-in rounded-lg bg-plate-100 object-contain dark:bg-plate-800"
                />
                <Button
                  variant="secondary"
                  onClick={downloadImage}
                  className="mt-3 w-full"
                >
                  画像をダウンロード
                </Button>
              </div>
            )}
          </section>
        )}
      </div>

      {/* 画像処理用の非表示Canvas */}
      <canvas ref={canvasRef} className="hidden" />
    </Card>
  );
}

export default EmbedCard;