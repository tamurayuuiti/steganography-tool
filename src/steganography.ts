/**
 * LSBステガノグラフィー処理
 *
 * 画像のピクセルデータ（RGBA）の最下位ビットにファイルデータを埋め込む。
 * Alphaチャンネル（4バイトごとの4番目）は画像の透明度を崩さないようスキップする。
 *
 * --- データフォーマット仕様（正式版） ---
 * 埋め込み・抽出・検証はすべて以下の単一フォーマットに従う。
 * 拡張子は File.name に含まれるため、専用フィールドは持たない。
 *
 *   [NameLen (uint16)] [Name (UTF-8)] [DataLen (uint32)] [Data]
 *
 * 旧仕様（抽出側のみ ExtLen/Ext フィールドを持つ6フィールド構造）は廃止済み。
 * フォーマットの定数（ビット数・チャンネル数等）は utils/bitIO.ts の STEGO_FORMAT に一元化されている。
 */

import type { ExtractedFile, PreviewKind, ProgressCallback } from "./types";
import {
  BitReader,
  BitWriter,
  decodeUtf8,
  encodeUtf8,
  STEGO_FORMAT,
} from "./utils/bitIO";

export const CONFIG = {
  /** UIフリーズを防ぐための処理単位（バイト数） */
  chunkSize: 50000,
  /** 抽出処理のチャンクサイズ（ピクセル単位、元の抽出ツール仕様に合わせる） */
  extractChunkSize: 1000,
  validImageTypes: ["image/png", "image/jpeg", "image/heif"],
  validImageExts: ["png", "jpg", "jpeg", "heif"],
} as const;

/**
 * ヘッダー（ファイル名長＋ファイル名＋データ長）に必要な合計ビット数を計算する。
 * 埋め込み可否判定（calcMaxDataBytes）・厳密検証（ensureCapacity）の両方が
 * この関数を介して同じ計算式を参照することで、概算と厳密計算の不一致を防ぐ。
 */
function calcHeaderBits(nameByteLength: number): number {
  return (
    STEGO_FORMAT.uint16Bits +
    nameByteLength * STEGO_FORMAT.bitsPerByte +
    STEGO_FORMAT.uint32Bits
  );
}

/**
 * 画像が埋め込みに利用できる総ビット数を計算する。
 * ピクセル数 × 埋め込み可能チャンネル数（RGB）= 利用可能ビット数。
 */
function calcEmbeddableBits(width: number, height: number): number {
  return width * height * STEGO_FORMAT.embeddableChannelsPerPixel;
}

/**
 * 埋め込み可能な最大データバイト数を計算する（UI表示用）。
 *
 * ファイル名が確定していない画像読み込み直後の時点でも目安を表示できるよう、
 * 最小ヘッダー（ファイル名長0バイト相当）を基準に算出する。
 * 実際の埋め込み可否は、ファイル名確定後に ensureCapacity による厳密判定で最終確認する。
 * いずれも calcHeaderBits / calcEmbeddableBits を共通利用しており、計算式自体は完全に一致する。
 */
export function calcMaxDataBytes(width: number, height: number): number {
  const embeddableBits = calcEmbeddableBits(width, height);
  const minHeaderBits = calcHeaderBits(0);
  return Math.floor(
    (embeddableBits - minHeaderBits) / STEGO_FORMAT.bitsPerByte,
  );
}

/**
 * 必要な合計ビット数が画像の埋め込み可能ビット数を超えていないか検証する（厳密判定）。
 */
export function ensureCapacity(
  width: number,
  height: number,
  nameLength: number,
  dataLength: number,
): void {
  const totalBitsNeeded =
    calcHeaderBits(nameLength) + dataLength * STEGO_FORMAT.bitsPerByte;
  const maxBits = calcEmbeddableBits(width, height);
  if (totalBitsNeeded > maxBits) {
    throw new Error("容量不足です");
  }
}

/**
 * ビット埋め込み処理（分割実行版）。
 * pixelData を直接書き換える（Uint8ClampedArray を破壊的に更新）。
 *
 * フォーマット: [NameLen(16bit)][NameBytes][DataLen(32bit)][DataBytes]
 */
export async function embed(
  pixelData: Uint8ClampedArray,
  nameBytes: Uint8Array,
  fileBytes: Uint8Array,
  onProgress: ProgressCallback,
): Promise<void> {
  const writer = new BitWriter(pixelData);

  // --- ヘッダー書き込み ---
  writer.writeUint16(nameBytes.length); // ファイル名長
  writer.writeBytes(nameBytes); // ファイル名
  writer.writeUint32(fileBytes.length); // データ長

  // --- データ本体書き込み (分割実行) ---
  const totalBytes = fileBytes.length;
  let processedBytes = 0;

  while (processedBytes < totalBytes) {
    const chunkEnd = Math.min(processedBytes + CONFIG.chunkSize, totalBytes);

    for (let i = processedBytes; i < chunkEnd; i++) {
      writer.writeByte(fileBytes[i]);
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
 *
 * フォーマット: [NameLen(16bit)][NameBytes][DataLen(32bit)][DataBytes]
 */
export async function verify(
  pixelData: Uint8ClampedArray,
  originalNameBytes: Uint8Array,
  originalFileBytes: Uint8Array,
  onProgress: ProgressCallback,
): Promise<void> {
  const reader = new BitReader(pixelData);

  // 1. ファイル名長の検証
  const nameLen = reader.readUint16();
  if (nameLen !== originalNameBytes.length)
    throw new Error("検証エラー: ファイル名長が不一致");

  // 2. ファイル名の検証
  for (let i = 0; i < nameLen; i++) {
    const charCode = reader.readByte();
    if (charCode !== originalNameBytes[i])
      throw new Error("検証エラー: ファイル名が不一致");
  }

  // 3. データ長の検証
  const dataLen = reader.readUint32();
  if (dataLen !== originalFileBytes.length)
    throw new Error("検証エラー: データサイズが不一致");

  // 4. データ本体の検証 (分割実行)
  let processedBytes = 0;
  while (processedBytes < dataLen) {
    const chunkEnd = Math.min(processedBytes + CONFIG.chunkSize, dataLen);

    for (let i = processedBytes; i < chunkEnd; i++) {
      const byte = reader.readByte();
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
 * フルファイル名（例: "photo.png"）を「名前」と「拡張子」に分割する。
 * ドットが先頭以外に無い場合は拡張子なしとして扱う（隠しファイル等の先頭ドットは無視）。
 *
 * データフォーマット上、ファイル名は拡張子を含む単一フィールドとして埋め込まれるため、
 * 抽出後にこの関数で ExtractedFile の name/extension に分割する。
 */
function splitFileName(fullName: string): {
  name: string;
  extension: string;
} {
  const lastDotIndex = fullName.lastIndexOf(".");
  if (lastDotIndex <= 0) {
    return { name: fullName, extension: "" };
  }
  return {
    name: fullName.slice(0, lastDotIndex),
    extension: fullName.slice(lastDotIndex + 1),
  };
}

/**
 * 抽出処理（分割実行版）。
 *
 * フォーマット: [NameLen(16bit)][NameBytes][DataLen(32bit)][DataBytes]
 * 埋め込み・検証と完全に同一のフォーマットを前提とする（旧仕様の拡張子フィールドは廃止）。
 * 復元したフルファイル名は splitFileName により name/extension に分割して返す。
 */
export async function extract(
  pixelData: Uint8ClampedArray,
  onProgress: ProgressCallback,
): Promise<ExtractedFile> {
  const reader = new BitReader(pixelData);

  // 1. ファイル名長の抽出（16ビット）
  const fileNameLength = reader.readUint16();

  // 2. ファイル名の抽出
  const fileNameBytes = reader.readBytes(fileNameLength);
  const fullFileName = decodeUtf8(fileNameBytes);

  // 3. データ長の抽出（32ビット）
  const dataLength = reader.readUint32();

  // 4. データ本体の抽出（チャンク分割実行）
  const binaryData = new Uint8Array(dataLength);
  let processedBytes = 0;

  while (processedBytes < dataLength) {
    const chunkEnd = Math.min(
      processedBytes + CONFIG.extractChunkSize,
      dataLength,
    );

    for (let i = processedBytes; i < chunkEnd; i++) {
      binaryData[i] = reader.readByte();
    }

    processedBytes = chunkEnd;
    onProgress(Math.round((processedBytes / dataLength) * 100));

    // メインスレッドを解放して描画更新させる
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }

  const { name, extension } = splitFileName(fullFileName);

  return {
    name,
    extension,
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

export { encodeUtf8 };