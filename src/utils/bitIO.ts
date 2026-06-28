/**
 * LSBステガノグラフィー用のビット単位読み書きユーティリティ。
 *
 * ピクセルデータ（RGBA Uint8ClampedArray）に対して、4チャンネルごとに
 * 4番目（Alpha）をスキップしながら最下位ビット（LSB）を読み書きする処理は
 * 埋め込み・検証・抽出のすべてで共通のため、ここに集約する。
 */

/**
 * ステガノグラフィーのヘッダー仕様・チャンネル構成を一元管理する定数。
 * フォーマットに関わる値はすべてここを参照し、各処理関数での再定義・マジックナンバー化を避ける。
 */
export const STEGO_FORMAT = {
  /** ファイル名長フィールドのビット数（uint16） */
  uint16Bits: 16,
  /** データ長フィールドのビット数（uint32） */
  uint32Bits: 32,
  /** 1バイトのビット数 */
  bitsPerByte: 8,
  /** 1ピクセルあたりのチャンネル数（RGBA） */
  channelsPerPixel: 4,
  /** 1ピクセルあたり埋め込みに使用できるチャンネル数（RGB。Alphaは透明度保持のため除外） */
  embeddableChannelsPerPixel: 3,
} as const;

/**
 * 現在の書き込み/読み出し位置がAlphaチャンネルかどうかを判定し、
 * Alphaチャンネルであれば1つ読み飛ばす。
 * チャンネル構成は RGBA の4チャンネル単位で、4番目（インデックス3, 7, 11...）がAlpha。
 */
function skipAlphaChannel(pixelIndex: number): number {
  if ((pixelIndex + 1) % STEGO_FORMAT.channelsPerPixel === 0) {
    return pixelIndex + 1;
  }
  return pixelIndex;
}

/**
 * ピクセルデータへのLSBビット書き込みを行うWriter。
 * 内部でAlphaチャンネルを自動スキップしながら、現在位置を進める。
 */
export class BitWriter {
  private pixelIndex = 0;

  constructor(private readonly pixelData: Uint8ClampedArray) {}

  /** 現在のピクセル配列インデックス（テスト・デバッグ用） */
  get position(): number {
    return this.pixelIndex;
  }

  /** 数値を指定ビット数（MSB→LSB順）で書き込む */
  writeBits(value: number, bitCount: number): void {
    for (let i = bitCount - 1; i >= 0; i--) {
      const bit = (value >> i) & 1;
      this.pixelIndex = skipAlphaChannel(this.pixelIndex);
      this.pixelData[this.pixelIndex] =
        (this.pixelData[this.pixelIndex] & 0xfe) | bit;
      this.pixelIndex++;
    }
  }

  /** uint16値を書き込む（ヘッダーの長さフィールド用） */
  writeUint16(value: number): void {
    this.writeBits(value, STEGO_FORMAT.uint16Bits);
  }

  /** uint32値を書き込む（ヘッダーの長さフィールド用） */
  writeUint32(value: number): void {
    this.writeBits(value, STEGO_FORMAT.uint32Bits);
  }

  /** バイト配列を順に書き込む（1バイト = 8ビット） */
  writeBytes(bytes: Uint8Array): void {
    for (let i = 0; i < bytes.length; i++) {
      this.writeBits(bytes[i], STEGO_FORMAT.bitsPerByte);
    }
  }

  /** 1バイトのみ書き込む */
  writeByte(byte: number): void {
    this.writeBits(byte, STEGO_FORMAT.bitsPerByte);
  }
}

/**
 * ピクセルデータからのLSBビット読み出しを行うReader。
 * 内部でAlphaチャンネルを自動スキップしながら、現在位置を進める。
 */
export class BitReader {
  private pixelIndex = 0;

  constructor(private readonly pixelData: Uint8ClampedArray) {}

  /** 現在のピクセル配列インデックス（テスト・デバッグ用） */
  get position(): number {
    return this.pixelIndex;
  }

  /** 指定ビット数（MSB→LSB順）を読み出して数値として復元する */
  readBits(bitCount: number): number {
    let value = 0;
    for (let i = 0; i < bitCount; i++) {
      this.pixelIndex = skipAlphaChannel(this.pixelIndex);
      const bit = this.pixelData[this.pixelIndex] & 1;
      value = (value << 1) | bit;
      this.pixelIndex++;
    }
    return value;
  }

  /** uint16値を読み出す（ヘッダーの長さフィールド用） */
  readUint16(): number {
    return this.readBits(STEGO_FORMAT.uint16Bits);
  }

  /** uint32値を読み出す（ヘッダーの長さフィールド用） */
  readUint32(): number {
    return this.readBits(STEGO_FORMAT.uint32Bits);
  }

  /** 1バイト読み出す */
  readByte(): number {
    return this.readBits(STEGO_FORMAT.bitsPerByte);
  }

  /** 指定バイト数を読み出してUint8Arrayとして返す */
  readBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      bytes[i] = this.readByte();
    }
    return bytes;
  }
}

/** UTF-8文字列をバイト配列にエンコードする（ファイル名のシリアライズに使用） */
export function encodeUtf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** バイト配列をUTF-8文字列にデコードする（ファイル名のデシリアライズに使用） */
export function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}