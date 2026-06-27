import { useCallback, useRef, useState } from "react";
import { drawImageToCanvas, loadImageFromFile } from "../utils/imageFile";

interface UseImageSourceOptions {
  /** 読み込み済み画像が対応形式かを検証する（未指定なら検証しない） */
  validate?: (file: File) => boolean;
  /** 検証に失敗した場合のメッセージ（validate指定時に使用） */
  validationErrorMessage?: string;
  /** 読み込み完了時に呼ばれる（dataUrl: Canvas描画前のData URL, imgData: 取得結果） */
  onLoaded?: (dataUrl: string, imgData: ImageData) => void;
}

/**
 * 画像ファイルをアップロードし、非表示Canvasを経由してImageDataを取得するHook。
 *
 * 「埋め込み元画像」「抽出元画像」の両方で
 * FileReader → Image → Canvas → ImageData という同一フローが使われているため共通化した。
 * バリデーションの有無・読み込み完了後の処理（容量計算やプレビュー保持など）は
 * オプション・コールバックで吸収する。
 */
export function useImageSource({
  validate,
  validationErrorMessage,
  onLoaded,
}: UseImageSourceOptions = {}) {
  const [fileName, setFileName] = useState<string>("");
  const [isLoaded, setIsLoaded] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  // ImageData は巨大なピクセル配列を保持するため、再レンダリングの対象にせず ref で保持する
  const imageDataRef = useRef<ImageData | null>(null);

  const loadFile = useCallback(
    async (file: File) => {
      if (validate && !validate(file)) {
        if (validationErrorMessage) alert(validationErrorMessage);
        return;
      }

      setIsLoaded(false);
      imageDataRef.current = null;
      setFileName(`選択中: ${file.name}`);

      const { dataUrl, image } = await loadImageFromFile(file);

      const canvas = canvasRef.current;
      if (!canvas) return;

      const imgData = drawImageToCanvas(image, canvas);
      if (!imgData) return;

      imageDataRef.current = imgData;
      setIsLoaded(true);
      onLoaded?.(dataUrl, imgData);
    },
    [validate, validationErrorMessage, onLoaded],
  );

  return {
    fileName,
    isLoaded,
    canvasRef,
    imageDataRef,
    loadFile,
  };
}