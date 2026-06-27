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