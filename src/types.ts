/** 進捗表示の状態（埋め込み・抽出で共有する型） */
export interface ProgressState {
  visible: boolean;
  message: string;
  percent: number;
  isRunning: boolean;
}

export const INITIAL_PROGRESS: ProgressState = {
  visible: false,
  message: "準備中...",
  percent: 0,
  isRunning: false,
};

/** 進捗を 0-100 の範囲で通知するコールバック（埋め込み・検証・抽出処理で共有） */
export type ProgressCallback = (percent: number) => void;

/**
 * 抽出結果として復元されるファイル情報。
 */
export interface ExtractedFile {
  name: string;
  extension: string;
  blob: Blob;
}

/** プレビュー可能な拡張子の種別 */
export type PreviewKind = "image" | "audio" | "text" | "unsupported";

/**
 * 埋め込み対象ファイルの基本情報（表示用）。
 * EmbedCard内でのみ使用するが、ファイル情報という性質上ここに集約する。
 */
export interface TargetFileInfo {
  name: string;
  size: number;
  type: string;
}

/**
 * プレビュー画像クリック時に拡大モーダルを開くコールバック。
 * EmbedCard・ExtractCardの両方からAppへ共有される。
 */
export type PreviewClickHandler = (src: string) => void;