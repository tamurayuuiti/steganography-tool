import { useCallback, useEffect, useRef, useState } from "react";
import {
  calcMaxDataBytes,
  ensureCapacity,
  embed,
  verify,
  formatBytes,
  isValidImage,
  extract,
  formatExtractedSize,
  getPreviewKind,
  type ExtractedFile,
} from "./steganography";

/** 埋め込み対象ファイルの基本情報（表示用） */
interface TargetFileInfo {
  name: string;
  size: number;
  type: string;
}

/** 進捗表示の状態 */
interface ProgressState {
  visible: boolean;
  message: string;
  percent: number;
  isRunning: boolean;
}

const INITIAL_PROGRESS: ProgressState = {
  visible: false,
  message: "準備中...",
  percent: 0,
  isRunning: false,
};

function App() {
  // --- 画像関連の状態 ---
  const [imageFileName, setImageFileName] = useState<string>("");
  const [originalPreviewSrc, setOriginalPreviewSrc] = useState<string>("");
  const [maxDataBytes, setMaxDataBytes] = useState<number>(0);

  // --- 埋め込み対象ファイルの状態 ---
  const [targetFile, setTargetFile] = useState<File | null>(null);
  const [targetFileInfo, setTargetFileInfo] = useState<TargetFileInfo | null>(
    null,
  );

  // --- 進捗・結果の状態 ---
  const [progress, setProgress] = useState<ProgressState>(INITIAL_PROGRESS);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [outputPreviewSrc, setOutputPreviewSrc] = useState<string>("");
  const [elapsedTime, setElapsedTime] = useState<string>("0.00s");

  // --- ドラッグ中のドロップエリア表示 ---
  const [isDraggingImage, setIsDraggingImage] = useState<boolean>(false);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);

  // --- モーダル ---
  const [modalSrc, setModalSrc] = useState<string>("");

  // --- 抽出関連の状態 ---
  const [extractImageName, setExtractImageName] = useState<string>("");
  const [isDraggingExtractImage, setIsDraggingExtractImage] =
    useState<boolean>(false);
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

  // --- DOM操作が必須な箇所のみ ref で保持 ---
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // ImageData は巨大なピクセル配列を保持するため、再レンダリングの対象にせず ref で保持する
  const imgDataRef = useRef<ImageData | null>(null);
  const originalFileNameRef = useRef<string>("");
  // ストップウォッチ用
  const startTimeRef = useRef<number>(0);
  const animationFrameIdRef = useRef<number | null>(null);

  // --- 抽出機能用 ref ---
  const extractCanvasRef = useRef<HTMLCanvasElement>(null);
  const extractImageInputRef = useRef<HTMLInputElement>(null);
  const extractImgDataRef = useRef<ImageData | null>(null);
  // createObjectURL で生成したURLはコンポーネントのライフサイクルを越えて残るため ref で管理し、明示的に解放する
  const extractedObjectUrlsRef = useRef<string[]>([]);

  // ストップウォッチ停止時にアニメーションフレームを確実に解放する
  useEffect(() => {
    return () => {
      if (animationFrameIdRef.current !== null) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
      // 生成済みのObject URLをまとめて解放する
      extractedObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const startStopwatch = useCallback(() => {
    startTimeRef.current = Date.now();
    const update = () => {
      const diff = (Date.now() - startTimeRef.current) / 1000;
      setElapsedTime(`${diff.toFixed(2)}s`);
      animationFrameIdRef.current = requestAnimationFrame(update);
    };
    update();
  }, []);

  const stopStopwatch = useCallback(() => {
    if (animationFrameIdRef.current !== null) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }
  }, []);

  // 新しい入力があった際に前回の処理結果・エラー表示をリセットする
  const resetResults = useCallback(() => {
    setOutputPreviewSrc("");
    setErrorMessage("");
    setProgress(INITIAL_PROGRESS);
  }, []);

  // --- 画像アップロード処理 ---
  const handleImageUpload = useCallback(
    (file: File) => {
      if (!isValidImage(file)) {
        alert("対応していない画像形式です。PNG, JPG, HEIFを使用してください。");
        return;
      }

      resetResults();
      originalFileNameRef.current = file.name;
      setImageFileName(`選択中: ${file.name}`);

      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result;
        if (typeof result !== "string") return;

        const img = new Image();
        img.onload = () => {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) return;

          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);

          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          imgDataRef.current = imgData;

          setOriginalPreviewSrc(result);
          setMaxDataBytes(calcMaxDataBytes(imgData.width, imgData.height));
        };
        img.src = result;
      };
      reader.readAsDataURL(file);
    },
    [resetResults],
  );

  // --- 埋め込み対象ファイルのアップロード処理 ---
  const handleFileUpload = useCallback((file: File) => {
    setTargetFile(file);
    setTargetFileInfo({ name: file.name, size: file.size, type: file.type });
  }, []);

  // 埋め込み可能容量を超えているかどうか
  const isOverCapacity = targetFile !== null && targetFile.size > maxDataBytes;
  const isEmbedReady =
    imgDataRef.current !== null && targetFile !== null && !isOverCapacity;

  // --- 埋め込み実行処理 ---
  const startEmbedding = useCallback(async () => {
    const imgData = imgDataRef.current;
    if (!imgData || !targetFile) return;

    setProgress({
      visible: true,
      message: "データ埋め込み中...",
      percent: 0,
      isRunning: true,
    });
    setErrorMessage("");
    startStopwatch();

    try {
      // 1. ファイルをArrayBufferとして読み込む
      const fileBuffer = await targetFile.arrayBuffer();
      const fileBytes = new Uint8Array(fileBuffer);

      // 2. メタデータの作成
      // 構造: [NameLen(16bit)][NameBytes][DataLen(32bit)][DataBytes]
      const fileNameBytes = new TextEncoder().encode(targetFile.name);

      ensureCapacity(
        imgData.width,
        imgData.height,
        fileNameBytes.length,
        fileBytes.length,
      );

      // 3. 埋め込み処理 (Chunking for UI responsiveness)
      await embed(imgData.data, fileNameBytes, fileBytes, (percent) => {
        setProgress((prev) => ({ ...prev, percent }));
      });

      // 4. 検証 (埋め込んだデータを読み出して比較)
      setProgress((prev) => ({ ...prev, message: "データ検証中..." }));
      await verify(imgData.data, fileNameBytes, fileBytes, (percent) => {
        setProgress((prev) => ({ ...prev, percent }));
      });

      // 5. 完了処理
      stopStopwatch();
      setProgress((prev) => ({
        ...prev,
        percent: 100,
        message: "完了",
        isRunning: false,
      }));

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
      setProgress((prev) => ({ ...prev, isRunning: false }));
      console.error(err);
    }
  }, [targetFile, startStopwatch, stopStopwatch]);

  // --- ダウンロード処理 ---
  const downloadImage = useCallback(() => {
    if (!outputPreviewSrc) return;
    const link = document.createElement("a");
    const baseName = originalFileNameRef.current.split(".")[0];
    link.download = `stego_${baseName}.png`;
    link.href = outputPreviewSrc;
    link.click();
  }, [outputPreviewSrc]);

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
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setExtractError(message);
      setExtractProgress((prev) => ({ ...prev, isRunning: false }));
      console.error(err);
    }
  }, []);

  // 抽出結果が確定したら、形式に応じたプレビュー（画像/音声URL・テキスト内容・画像寸法）を生成する
  useEffect(() => {
    if (!extractedFile) {
      setExtractedPreviewUrl("");
      setExtractedTextPreview("");
      return;
    }

    const kind = getPreviewKind(extractedFile.extension);

    if (kind === "image" || kind === "audio") {
      const objectUrl = URL.createObjectURL(extractedFile.blob);
      extractedObjectUrlsRef.current.push(objectUrl);
      setExtractedPreviewUrl(objectUrl);

      if (kind === "image") {
        const img = new Image();
        img.onload = () => {
          const megaPixels = ((img.width * img.height) / 1_000_000).toFixed(2);
          setExtractedImageDimensions(
            `${img.width}x${img.height} ピクセル (${megaPixels} MP)`,
          );
        };
        img.src = objectUrl;
      }
    } else if (kind === "text") {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result;
        if (typeof result === "string") setExtractedTextPreview(result);
      };
      reader.readAsText(extractedFile.blob);
    }
  }, [extractedFile]);

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

  // --- モーダル ---
  const openModal = useCallback((src: string) => {
    if (!src) return;
    setModalSrc(src);
  }, []);

  const closeModal = useCallback(() => {
    setModalSrc("");
  }, []);

  // --- ドラッグ&ドロップ共通ハンドラ生成 ---
  const makeDropHandlers = (
    setDragging: (v: boolean) => void,
    handler: (file: File) => void,
  ) => ({
    onDragOver: (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop: (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handler(file);
    },
  });

  const imageDropHandlers = makeDropHandlers(
    setIsDraggingImage,
    handleImageUpload,
  );
  const fileDropHandlers = makeDropHandlers(
    setIsDraggingFile,
    handleFileUpload,
  );
  const extractImageDropHandlers = makeDropHandlers(
    setIsDraggingExtractImage,
    handleExtractImageUpload,
  );

  // 容量情報は画像読み込み後のみ表示する
  const showCapacityInfo = maxDataBytes > 0;

  return (
    <div className="min-h-screen bg-neutral-50 p-5 text-neutral-800 dark:bg-neutral-900 dark:text-neutral-200">
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        <div className="rounded-xl bg-white p-6 shadow-lg sm:p-8 dark:bg-neutral-800">
          <h3 className="mb-4 inline-block border-b-2 border-emerald-500 pb-1 text-xl font-semibold">
            画像にファイルを埋め込む
          </h3>

          {/* 画像ドロップエリア */}
          <div
            {...imageDropHandlers}
            onClick={() => imageInputRef.current?.click()}
            className={`mb-5 cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
              isDraggingImage
                ? "border-emerald-500 bg-emerald-500/10"
                : "border-neutral-300 dark:border-neutral-600"
            }`}
          >
            <p className="pointer-events-none mb-2 text-neutral-600 dark:text-neutral-400">
              1. ここに画像 (PNG/JPG) をドラッグ＆ドロップ
            </p>
            <label
              onClick={(e) => e.stopPropagation()}
              className="inline-block cursor-pointer rounded bg-neutral-300 px-4 py-2 text-sm text-neutral-800 hover:opacity-80 dark:bg-neutral-600 dark:text-neutral-200"
            >
              画像を選択
              <input
                ref={imageInputRef}
                type="file"
                accept="image/png, image/jpeg, image/heif"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload(file);
                }}
              />
            </label>
            {imageFileName && (
              <p className="pointer-events-none mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                {imageFileName}
              </p>
            )}
          </div>

          {/* 隠したいファイルのドロップエリア */}
          <div
            {...fileDropHandlers}
            onClick={() => fileInputRef.current?.click()}
            className={`mb-5 cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
              isDraggingFile
                ? "border-emerald-500 bg-emerald-500/10"
                : "border-neutral-300 dark:border-neutral-600"
            }`}
          >
            <p className="pointer-events-none mb-2 text-neutral-600 dark:text-neutral-400">
              2. ここに隠したいファイルをドラッグ＆ドロップ
            </p>
            <label
              onClick={(e) => e.stopPropagation()}
              className="inline-block cursor-pointer rounded bg-neutral-300 px-4 py-2 text-sm text-neutral-800 hover:opacity-80 dark:bg-neutral-600 dark:text-neutral-200"
            >
              ファイルを選択
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
              />
            </label>

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
          </div>

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
            {progress.visible && (
              <div className="mt-4 flex items-center">
                {progress.isRunning && (
                  <span className="mr-2.5 inline-block h-5 w-5 animate-spin rounded-full border-4 border-black/10 border-l-emerald-500 align-middle dark:border-white/10 dark:border-l-emerald-500" />
                )}
                <span className="font-bold">{progress.message}</span>
                <span className="ml-auto font-mono">{elapsedTime}</span>
              </div>
            )}

            {progress.visible && (
              <div className="relative mt-5 h-6 w-full overflow-hidden rounded-full bg-neutral-300 dark:bg-neutral-600">
                <div
                  className="h-full bg-emerald-500 transition-[width] duration-100 ease-linear"
                  style={{
                    width: `${Math.min(progress.percent, 100).toFixed(1)}%`,
                  }}
                />
                <span className="absolute top-0 left-1/2 -translate-x-1/2 text-xs leading-6 font-bold text-white [text-shadow:0_0_2px_rgba(0,0,0,0.5)]">
                  {Math.min(progress.percent, 100).toFixed(1)}%
                </span>
              </div>
            )}

            {errorMessage && (
              <div className="mt-2.5 font-bold text-red-500">
                {errorMessage}
              </div>
            )}
          </div>

          {/* プレビューセクション */}
          <div className="mt-8 flex flex-wrap justify-around gap-5">
            {originalPreviewSrc && (
              <div className="min-w-65 flex-1 rounded-lg border border-neutral-300 p-2.5 text-center dark:border-neutral-600">
                <p className="text-neutral-600 dark:text-neutral-400">元画像</p>
                <img
                  src={originalPreviewSrc}
                  onClick={() => openModal(originalPreviewSrc)}
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
                  onClick={() => openModal(outputPreviewSrc)}
                  alt="埋め込み後画像のプレビュー"
                  className="mt-2.5 max-h-75 max-w-full cursor-zoom-in rounded bg-neutral-500 object-contain"
                />
              </div>
            )}
          </div>
        </div>

        {/* 抽出カード */}
        <div className="rounded-xl bg-white p-6 shadow-lg sm:p-8 dark:bg-neutral-800">
          <h3 className="mb-4 inline-block border-b-2 border-emerald-500 pb-1 text-xl font-semibold">
            画像から埋め込まれたデータを抽出
          </h3>

          {/* 抽出用画像ドロップエリア */}
          <div
            {...extractImageDropHandlers}
            onClick={() => extractImageInputRef.current?.click()}
            className={`mb-5 cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
              isDraggingExtractImage
                ? "border-emerald-500 bg-emerald-500/10"
                : "border-neutral-300 dark:border-neutral-600"
            }`}
          >
            <p className="pointer-events-none mb-2 text-neutral-600 dark:text-neutral-400">
              ここに画像をドラッグ＆ドロップしてください
            </p>
            <p className="pointer-events-none mb-2 text-sm text-neutral-500 dark:text-neutral-500">
              または
            </p>
            <label
              onClick={(e) => e.stopPropagation()}
              className="inline-block cursor-pointer rounded bg-neutral-300 px-4 py-2 text-sm text-neutral-800 hover:opacity-80 dark:bg-neutral-600 dark:text-neutral-200"
            >
              画像を選択
              <input
                ref={extractImageInputRef}
                type="file"
                accept="image/png, image/jpeg, image/heif"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleExtractImageUpload(file);
                }}
              />
            </label>
            {extractImageName && (
              <p className="pointer-events-none mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                {extractImageName}
              </p>
            )}
          </div>

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
            {extractProgress.visible && (
              <div className="mt-4 flex items-center">
                {extractProgress.isRunning && (
                  <span className="mr-2.5 inline-block h-5 w-5 animate-spin rounded-full border-4 border-black/10 border-l-emerald-500 align-middle dark:border-white/10 dark:border-l-emerald-500" />
                )}
                <span className="font-bold">{extractProgress.message}</span>
              </div>
            )}

            {extractProgress.visible && (
              <div className="relative mt-5 h-6 w-full overflow-hidden rounded-full bg-neutral-300 dark:bg-neutral-600">
                <div
                  className="h-full bg-emerald-500 transition-[width] duration-100 ease-linear"
                  style={{
                    width: `${Math.min(extractProgress.percent, 100).toFixed(1)}%`,
                  }}
                />
                <span className="absolute top-0 left-1/2 -translate-x-1/2 text-xs leading-6 font-bold text-white [text-shadow:0_0_2px_rgba(0,0,0,0.5)]">
                  {Math.min(extractProgress.percent, 100).toFixed(1)}%
                </span>
              </div>
            )}

            {extractError && (
              <div className="mt-2.5 font-bold text-red-500">
                {extractError}
              </div>
            )}
          </div>

          {/* 抽出されたファイル情報 */}
          {extractedFile && (
            <div className="mt-5 text-sm text-neutral-600 dark:text-neutral-400">
              ファイル名: {extractedFile.name}.{extractedFile.extension}、容量:{" "}
              {formatExtractedSize(extractedFile.blob.size)}
              {extractedImageDimensions &&
                `、サイズ: ${extractedImageDimensions}`}
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
                    onClick={() => openModal(extractedPreviewUrl)}
                    alt="抽出された画像のプレビュー"
                    className="mx-auto max-h-75 max-w-full cursor-zoom-in rounded bg-neutral-500 object-contain"
                  />
                )}
              {getPreviewKind(extractedFile.extension) === "audio" &&
                extractedPreviewUrl && (
                  <audio
                    controls
                    src={extractedPreviewUrl}
                    className="w-full"
                  />
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
      </div>

      {/* 画像処理用の非表示Canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* 拡大表示モーダル */}
      {modalSrc && (
        <div
          onClick={closeModal}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
        >
          <img
            src={modalSrc}
            alt="拡大画像"
            className="max-h-[95%] max-w-[95%] shadow-[0_0_20px_rgba(255,255,255,0.2)]"
          />
        </div>
      )}
    </div>
  );
}

export default App;