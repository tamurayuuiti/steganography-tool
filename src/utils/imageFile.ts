/**
 * File/Image/Canvas関連の純粋ユーティリティ関数群。
 * React非依存の処理をここに集約する。
 */

/**
 * File（画像）を読み込み、Data URLとHTMLImageElementを取得する。
 * FileReader → Image のロード待ちを Promise でまとめたもの。
 */
export function loadImageFromFile(
  file: File,
): Promise<{ dataUrl: string; image: HTMLImageElement }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (typeof result !== "string") {
        reject(new Error("ファイルの読み込みに失敗しました"));
        return;
      }

      const img = new Image();
      img.onload = () => resolve({ dataUrl: result, image: img });
      img.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
      img.src = result;
    };
    reader.onerror = () => reject(new Error("ファイルの読み込みに失敗しました"));
    reader.readAsDataURL(file);
  });
}

/**
 * HTMLImageElement を指定の Canvas に描画し、ImageData を取得する。
 * Canvas は呼び出し側（refで保持しているDOM要素）を渡す。
 */
export function drawImageToCanvas(
  image: HTMLImageElement,
  canvas: HTMLCanvasElement,
): ImageData | null {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  canvas.width = image.width;
  canvas.height = image.height;
  ctx.drawImage(image, 0, 0);

  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * Blob を Data URL として読み込む（テキストプレビュー等に利用）。
 */
export function readBlobAsText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text === "string") {
        resolve(text);
      } else {
        reject(new Error("テキストの読み込みに失敗しました"));
      }
    };
    reader.onerror = () => reject(new Error("テキストの読み込みに失敗しました"));
    reader.readAsText(blob);
  });
}

/**
 * Object URL から画像を読み込み、寸法情報を取得する。
 */
export function loadImageDimensions(
  objectUrl: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
    img.src = objectUrl;
  });
}

/**
 * ピクセル数を「width x height ピクセル (n MP)」形式の文字列に変換する。
 */
export function formatImageDimensions(width: number, height: number): string {
  const megaPixels = ((width * height) / 1_000_000).toFixed(2);
  return `${width}x${height} ピクセル (${megaPixels} MP)`;
}