import { useCallback, useRef, useState } from "react";
import {
  extract,
  formatExtractedSize,
  getPreviewKind,
  type ExtractedFile,
} from "../steganography";
import { INITIAL_PROGRESS, type ProgressState } from "../types";
import FileDropZone from "./FileDropZone";
import ProgressBar from "./ProgressBar";

interface ExtractCardProps {
  /** プレビュー画像クリック時に拡大モーダルを開く */
  onPreviewClick: (src: string) => void;
}

/**
 * 「画像から埋め込まれたデータを抽出」カード。
 * 抽出用画像のアップロードから抽出実行、進捗表示、
 * 結果プレビュー（画像/音声/テキスト）・ダウンロードまでの責務を持つ。
 */
function ExtractCard({ onPreviewClick }: ExtractCardProps) {
  // --- 抽出関連の状態 ---
  const [extractImageName, setExtractImageName] = useState<string>("");
  const [isExtractReady, setIsExtractReady] = useState<boolean>(false);
  const [extractProgress, setExtractProgress] =
    useState<ProgressState>(INITIAL_PROGRESS);
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

  // --- 抽出機能用 ref ---
  const extractCanvasRef = useRef<HTMLCanvasElement>(null);
  const extractImageInputRef = useRef<HTMLInputElement>(null);
  const extractImgDataRef = useRef<ImageData | null>(null);
  // createObjectURL で生成したURLはコンポーネントのライフサイクルを越えて残るため ref で管理し、明示的に解放する
  const extractedObjectUrlsRef = useRef<string[]>([]);

  // --- 抽出: 結果のリセット ---
  const resetExtractResults = useCallback(() => {
    setExtractProgress(INITIAL_PROGRESS);
    setExtractError("");
    setExtractedFile(null);
    setExtractedImageDimensions("");
    setExtractedPreviewUrl("");
    setExtractedTextPreview("");
    extractedObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    extractedObjectUrlsRef.current = [];
  }, []);

  // --- 抽出: 画像アップロード処理 ---
  const handleExtractImageUpload = useCallback(
    (file: File) => {
      resetExtractResults();
      extractImgDataRef.current = null;
      setIsExtractReady(false);
      setExtractImageName(`選択中: ${file.name}`);

      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result;
        if (typeof result !== "string") return;

        const img = new Image();
        img.onload = () => {
          const canvas = extractCanvasRef.current;
          if (!canvas) return;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) return;

          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);

          extractImgDataRef.current = ctx.getImageData(
            0,
            0,
            canvas.width,
            canvas.height,
          );
          setIsExtractReady(true);
        };
        img.src = result;
      };
      reader.readAsDataURL(file);
    },
    [resetExtractResults],
  );

  // --- 抽出: 実行処理 ---
  const startExtraction = useCallback(async () => {
    const imgData = extractImgDataRef.current;
    if (!imgData) {
      alert("画像がアップロードされていません。");
      return;
    }

    setExtractProgress({
      visible: true,
      message: "データ抽出中",
      percent: 0,
      isRunning: true,
    });
    setExtractError("");

    try {
      const result = await extract(imgData.data, (percent) => {
        setExtractProgress((prev) => ({
          ...prev,
          percent,
          message: percent === 100 ? "データ抽出完了" : "データ抽出中",
        }));
      });

      setExtractedFile(result);
      setExtractProgress((prev) => ({ ...prev, isRunning: false }));

      // 抽出結果の形式に応じたプレビュー（画像/音声URL・テキスト内容・画像寸法）を生成する
      const kind = getPreviewKind(result.extension);

      if (kind === "image" || kind === "audio") {
        const objectUrl = URL.createObjectURL(result.blob);
        extractedObjectUrlsRef.current.push(objectUrl);
        setExtractedPreviewUrl(objectUrl);

        if (kind === "image") {
          const img = new Image();
          img.onload = () => {
            const megaPixels = ((img.width * img.height) / 1_000_000).toFixed(
              2,
            );
            setExtractedImageDimensions(
              `${img.width}x${img.height} ピクセル (${megaPixels} MP)`,
            );
          };
          img.src = objectUrl;
        }
      } else if (kind === "text") {
        const reader = new FileReader();
        reader.onload = (e) => {
          const text = e.target?.result;
          if (typeof text === "string") setExtractedTextPreview(text);
        };
        reader.readAsText(result.blob);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setExtractError(message);
      setExtractProgress((prev) => ({ ...prev, isRunning: false }));
      console.error(err);
    }
  }, []);

  // --- 抽出: ダウンロード処理 ---
  const downloadExtractedFile = useCallback(() => {
    if (!extractedFile) return;
    const link = document.createElement("a");
    const objectUrl = URL.createObjectURL(extractedFile.blob);
    extractedObjectUrlsRef.current.push(objectUrl);
    link.href = objectUrl;
    link.download = `${extractedFile.name}.${extractedFile.extension}`;
    link.click();
  }, [extractedFile]);

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