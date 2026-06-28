import { useCallback, useMemo, useRef, useState } from "react";
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
import { Alert, Badge, Button, Card, SectionLabel, StepDots } from "./ui";

interface ExtractCardProps {
  /** プレビュー画像クリック時に拡大モーダルを開く */
  onPreviewClick: PreviewClickHandler;
}

/**
 * 「見つける」フロー。画像選択 → 抽出実行 → 結果確認、という2ステップ
 * （埋め込みと異なり対象ファイル選択が無いため、見せ方も3段階のうち
 * 中間ステップを省いた構成にする）。
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
  // テキストプレビューのコピー完了表示（一時的）
  const [isCopied, setIsCopied] = useState(false);

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
    setIsCopied(false);
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

  // 現在の到達ステップ（StepDots表示用）: 0=画像待ち 1=実行可能 2=完了
  const currentStep = useMemo(() => {
    if (extractedFile) return 2;
    if (isExtractReady) return 1;
    return 0;
  }, [isExtractReady, extractedFile]);

  // --- 抽出: 実行処理 ---
  const startExtraction = useCallback(async () => {
    const imgData = extractImgDataRef.current;
    if (!imgData) {
      alert("画像がアップロードされていません。");
      return;
    }

    start("データを探しています...");
    setExtractError("");

    try {
      const result = await extract(imgData.data, (percent) => {
        update({
          percent,
          message: percent === 100 ? "見つかりました" : "データを探しています...",
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

  // --- 抽出: テキストプレビューのコピー処理 ---
  const copyTextPreview = useCallback(() => {
    void navigator.clipboard.writeText(extractedTextPreview).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 1800);
    });
  }, [extractedTextPreview]);

  const previewKind = extractedFile
    ? getPreviewKind(extractedFile.extension)
    : null;

  return (
    <Card className="p-6 sm:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-plate-900 dark:text-white">
            画像から隠れたファイルを見つける
          </h2>
          <p className="mt-0.5 text-sm text-plate-500 dark:text-plate-400">
            画像を読み込み、隠れているデータを取り出します
          </p>
        </div>
        <StepDots total={3} current={currentStep} />
      </div>

      <div className="space-y-5">
        {/* ステップ1: 画像 */}
        <section>
          <SectionLabel index={1}>調べたい画像</SectionLabel>
          <FileDropZone
            title={
              isExtractReady ? "別の画像に変更する" : "画像をドラッグ＆ドロップ"
            }
            hint="このツールで埋め込んだ画像を指定してください"
            selectLabel="画像を選択"
            accept="image/png, image/jpeg, image/heif"
            onFileSelect={handleExtractImageUpload}
            inputRef={extractImageInputRef}
            isFilled={isExtractReady}
          >
            {extractImageName && (
              <p className="pointer-events-none mt-3 text-xs font-medium text-plate-600 dark:text-plate-300">
                {extractImageName.replace("選択中: ", "")}
              </p>
            )}
          </FileDropZone>
        </section>

        {/* ステップ2: 実行・結果 */}
        <section
          className={`border-t border-plate-100 pt-5 dark:border-plate-700 ${
            isExtractReady ? "" : "pointer-events-none opacity-40"
          }`}
        >
          <SectionLabel index={2}>抽出</SectionLabel>
          <Button
            size="lg"
            disabled={!isExtractReady || extractProgress.isRunning}
            onClick={startExtraction}
            className="w-full"
          >
            {extractProgress.isRunning ? "処理中..." : "データを抽出する"}
          </Button>

          <ProgressBar progress={extractProgress} />

          {extractError && (
            <div className="mt-3">
              <Alert tone="rose">{extractError}</Alert>
            </div>
          )}
        </section>

        {/* 結果セクション */}
        {extractedFile && (
          <section className="border-t border-plate-100 pt-5 dark:border-plate-700">
            <SectionLabel index={3}>見つかったファイル</SectionLabel>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge tone="teal">
                {extractedFile.name}.{extractedFile.extension}
              </Badge>
              <Badge>{formatExtractedSize(extractedFile.blob.size)}</Badge>
              {extractedImageDimensions && (
                <Badge>{extractedImageDimensions}</Badge>
              )}
            </div>

            <div className="mt-4">
              {previewKind === "image" && extractedPreviewUrl && (
                <img
                  src={extractedPreviewUrl}
                  onClick={() => onPreviewClick(extractedPreviewUrl)}
                  alt="抽出された画像のプレビュー"
                  className="mx-auto max-h-72 w-full cursor-zoom-in rounded-lg bg-plate-100 object-contain dark:bg-plate-800"
                />
              )}
              {previewKind === "audio" && extractedPreviewUrl && (
                <audio
                  controls
                  src={extractedPreviewUrl}
                  className="w-full"
                />
              )}
              {previewKind === "text" && (
                <div className="relative">
                  <div className="max-h-72 overflow-y-auto rounded-lg border border-plate-200 bg-plate-50 p-3.5 text-left text-sm whitespace-pre-wrap text-plate-700 dark:border-plate-700 dark:bg-plate-900 dark:text-plate-300">
                    {extractedTextPreview}
                  </div>
                  <button
                    type="button"
                    onClick={copyTextPreview}
                    className="absolute top-2.5 right-2.5 rounded-md bg-white px-2.5 py-1 text-xs font-medium text-plate-600 shadow-sm transition-colors hover:bg-plate-100 dark:bg-plate-700 dark:text-plate-200 dark:hover:bg-plate-600"
                  >
                    {isCopied ? "コピーしました" : "コピー"}
                  </button>
                </div>
              )}
              {previewKind === "unsupported" && (
                <Alert tone="amber">
                  このファイル形式（{extractedFile.extension}）はプレビュー
                  に対応していません。ダウンロードして確認してください。
                </Alert>
              )}
            </div>

            <Button
              variant="secondary"
              onClick={downloadExtractedFile}
              className="mt-4 w-full"
            >
              ダウンロード
            </Button>
          </section>
        )}
      </div>

      {/* 抽出処理用の非表示Canvas */}
      <canvas ref={extractCanvasRef} className="hidden" />
    </Card>
  );
}

export default ExtractCard;