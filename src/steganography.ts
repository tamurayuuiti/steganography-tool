/**
 * LSBステガノグラフィー処理
 *
 * 画像のピクセルデータ（RGBA）の最下位ビットにファイルデータを埋め込む。
 * Alphaチャンネル（4バイトごとの4番目）は画像の透明度を崩さないようスキップする。
 *
 * データ構造: [ファイル名長(16bit)][ファイル名][データ長(32bit)][データ本体]
 */

export const CONFIG = {
  /** UIフリーズを防ぐための処理単位（バイト数） */
  chunkSize: 50000,
  /** ヘッダー用予約バイト（概算） */
  headerBytes: 200,
  validImageTypes: ["image/png", "image/jpeg", "image/heif"],
  validImageExts: ["png", "jpg", "jpeg", "heif"],
} as const;

/** 進捗を 0-100 の範囲で通知するコールバック */
export type ProgressCallback = (percent: number) => void;

/**
 * 埋め込み可能な最大バイト数を計算する。
 * ピクセル数 * 3チャンネル(RGB) * 1bit / 8bit = バイト数。そこからヘッダー分を引く。
 */
export function calcMaxDataBytes(width: number, height: number): number {
  const pixelCount = width * height;
  return Math.floor((pixelCount * 3) / 8) - CONFIG.headerBytes;
}

/**
 * 必要な合計ビット数が画像の埋め込み可能ビット数を超えていないか検証する。
 */
export function ensureCapacity(
  width: number,
  height: number,
  nameLength: number,
  dataLength: number,
): void {
  const totalBitsNeeded = 16 + nameLength * 8 + 32 + dataLength * 8;
  const maxBits = width * height * 3;
  if (totalBitsNeeded > maxBits) {
    throw new Error("容量不足です");
  }
}

/**
 * ビット埋め込み処理（分割実行版）。
 * pixelData を直接書き換える（Uint8ClampedArray を破壊的に更新）。
 */
export async function embed(
  pixelData: Uint8ClampedArray,
  nameBytes: Uint8Array,
  fileBytes: Uint8Array,
  onProgress: ProgressCallback,
): Promise<void> {
  let pixelIndex = 0;

  // Helper: 数値を指定ビット数で埋め込む
  const writeBits = (value: number, bitCount: number): void => {
    for (let i = bitCount - 1; i >= 0; i--) {
      const bit = (value >> i) & 1;
      // Alphaチャンネル(3, 7, 11...)はスキップ
      if ((pixelIndex + 1) % 4 === 0) pixelIndex++;

      // LSBを書き換え
      pixelData[pixelIndex] = (pixelData[pixelIndex] & 0xfe) | bit;
      pixelIndex++;
    }
  };

  // Helper: バイト配列を埋め込む
  const writeByteArray = (bytes: Uint8Array): void => {
    for (let i = 0; i < bytes.length; i++) {
      writeBits(bytes[i], 8);
    }
  };

  // --- ヘッダー書き込み ---
  writeBits(nameBytes.length, 16); // ファイル名長
  writeByteArray(nameBytes); // ファイル名
  writeBits(fileBytes.length, 32); // データ長

  // --- データ本体書き込み (分割実行) ---
  const totalBytes = fileBytes.length;
  let processedBytes = 0;

  while (processedBytes < totalBytes) {
    const chunkEnd = Math.min(processedBytes + CONFIG.chunkSize, totalBytes);

    // チャンク処理
    for (let i = processedBytes; i < chunkEnd; i++) {
      const byte = fileBytes[i];
      // 8ビット展開して書き込み (最適化: ループ展開しても良いが可読性重視)
      for (let bitPos = 7; bitPos >= 0; bitPos--) {
        if ((pixelIndex + 1) % 4 === 0) pixelIndex++;
        pixelData[pixelIndex] =
          (pixelData[pixelIndex] & 0xfe) | ((byte >> bitPos) & 1);
        pixelIndex++;
      }
    }

    processedBytes = chunkEnd;

    // UI更新 (プログレスバー: 0-90%)
    const percent = (processedBytes / totalBytes) * 90;
    onProgress(percent);

    // メインスレッドを解放して描画更新させる
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

/**
 * 検証処理（分割実行版）。
 * 埋め込んだデータを読み出し、元データと一致するか確認する。不一致なら例外を投げる。
 */
export async function verify(
  pixelData: Uint8ClampedArray,
  originalNameBytes: Uint8Array,
  originalFileBytes: Uint8Array,
  onProgress: ProgressCallback,
): Promise<void> {
  let pixelIndex = 0;

  // Helper: ビットを読み出して数値を復元
  const readBits = (bitCount: number): number => {
    let value = 0;
    for (let i = 0; i < bitCount; i++) {
      if ((pixelIndex + 1) % 4 === 0) pixelIndex++;
      const bit = pixelData[pixelIndex] & 1;
      value = (value << 1) | bit;
      pixelIndex++;
    }
    return value;
  };

  // 1. ファイル名長の検証
  const nameLen = readBits(16);
  if (nameLen !== originalNameBytes.length)
    throw new Error("検証エラー: ファイル名長が不一致");

  // 2. ファイル名の検証
  for (let i = 0; i < nameLen; i++) {
    const charCode = readBits(8);
    if (charCode !== originalNameBytes[i])
      throw new Error("検証エラー: ファイル名が不一致");
  }

  // 3. データ長の検証
  const dataLen = readBits(32);
  if (dataLen !== originalFileBytes.length)
    throw new Error("検証エラー: データサイズが不一致");

  // 4. データ本体の検証 (分割実行)
  let processedBytes = 0;
  while (processedBytes < dataLen) {
    const chunkEnd = Math.min(processedBytes + CONFIG.chunkSize, dataLen);

    for (let i = processedBytes; i < chunkEnd; i++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        if ((pixelIndex + 1) % 4 === 0) pixelIndex++;
        byte = (byte << 1) | (pixelData[pixelIndex] & 1);
        pixelIndex++;
      }
      if (byte !== originalFileBytes[i]) {
        throw new Error(`検証エラー: バイト不一致 (位置: ${i})`);
      }
    }

    processedBytes = chunkEnd;

    // UI更新 (プログレスバー: 90-100%)
    const percent = 90 + (processedBytes / dataLen) * 10;
    onProgress(percent);

    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

/**
 * バイト数を読みやすい単位（Bytes/KB/MB/GB）の文字列に変換する。
 */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * ファイルが対応している画像形式かどうかを判定する。
 */
export function isValidImage(file: File): boolean {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return (
    CONFIG.validImageTypes.includes(
      file.type as (typeof CONFIG.validImageTypes)[number],
    ) ||
    CONFIG.validImageExts.includes(
      ext as (typeof CONFIG.validImageExts)[number],
    )
  );
}

/**
 * 抽出結果として復元されるファイル情報。
 */
export interface ExtractedFile {
  name: string;
  extension: string;
  blob: Blob;
}

/**
 * 抽出処理のチャンクサイズ（ピクセル単位、元の抽出ツール仕様に合わせる）。
 */
const EXTRACT_CHUNK_SIZE = 1000;

/**
 * 抽出処理（分割実行版）。
 *
 * 注意: 抽出側のデータ構造は埋め込み側（embed/verify）と異なり、
 * [NameLen(16bit)][NameBytes][DataLen(32bit)][ExtLen(8bit)][ExtBytes][DataBytes] という
 * 拡張子フィールドを含む構造を前提としている。元の単一HTMLアプリの仕様をそのまま維持している。
 */
export async function extract(
  pixelData: Uint8ClampedArray,
  onProgress: ProgressCallback,
): Promise<ExtractedFile> {
  let pixelIndex = 0;

  // Helper: ビットを読み出して数値を復元（Alphaチャンネルをスキップ）
  const readBits = (bitCount: number): number => {
    let value = 0;
    for (let i = 0; i < bitCount; i++) {
      const bit = pixelData[pixelIndex] & 1;
      value = (value << 1) | bit;
      pixelIndex += 1;
      if ((pixelIndex + 1) % 4 === 0) pixelIndex += 1;
    }
    return value;
  };

  // 1. ファイル名長の抽出（16ビット）
  const fileNameLength = readBits(16);

  // 2. ファイル名の抽出
  const fileNameBytes = new Uint8Array(fileNameLength);
  for (let i = 0; i < fileNameLength; i++) {
    fileNameBytes[i] = readBits(8);
  }
  const fileName = new TextDecoder().decode(fileNameBytes);

  // 3. データ長の抽出（32ビット）
  const dataLength = readBits(32);

  // 4. 拡張子長の抽出（8ビット）
  const extLength = readBits(8);

  // 5. ファイル拡張子の抽出
  let fileExtension = "";
  for (let i = 0; i < extLength; i++) {
    fileExtension += String.fromCharCode(readBits(8));
  }

  // 6. データ本体の抽出（チャンク分割実行）
  const binaryData = new Uint8Array(dataLength);
  let processedBytes = 0;

  while (processedBytes < dataLength) {
    const chunkEnd = Math.min(processedBytes + EXTRACT_CHUNK_SIZE, dataLength);

    for (let i = processedBytes; i < chunkEnd; i++) {
      binaryData[i] = readBits(8);
    }

    processedBytes = chunkEnd;
    onProgress(Math.round((processedBytes / dataLength) * 100));

    // メインスレッドを解放して描画更新させる
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }

  return {
    name: fileName,
    extension: fileExtension,
    blob: new Blob([binaryData]),
  };
}

/**
 * 容量をBytes/KB/MBに変換する（抽出ツール仕様: GB単位は表示しない）。
 */
export function formatExtractedSize(size: number): string {
  if (size >= 1048576) {
    return `${(size / 1048576).toFixed(2)} MB`;
  } else if (size >= 1024) {
    return `${(size / 1024).toFixed(2)} KB`;
  }
  return `${size} バイト`;
}

/** プレビュー可能な拡張子の種別 */
export type PreviewKind = "image" | "audio" | "text" | "unsupported";

/**
 * 拡張子からプレビュー種別を判定する。
 */
export function getPreviewKind(extension: string): PreviewKind {
  const ext = extension.toLowerCase();
  if (ext === "png" || ext === "jpg" || ext === "jpeg") return "image";
  if (ext === "wav") return "audio";
  if (ext === "txt" || ext === "json" || ext === "csv") return "text";
  return "unsupported";
}