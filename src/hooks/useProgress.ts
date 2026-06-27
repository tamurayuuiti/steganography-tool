import { useCallback, useState } from "react";
import { INITIAL_PROGRESS, type ProgressState } from "../types";

/**
 * 進捗状態（ProgressState）の管理Hook。
 * 埋め込み・抽出の両処理で同じ更新パターン
 * （開始・進捗率更新・メッセージ更新・完了・リセット）が重複していたため共通化。
 */
export function useProgress() {
  const [progress, setProgress] = useState<ProgressState>(INITIAL_PROGRESS);

  /** 処理開始時の状態にする */
  const start = useCallback((message: string) => {
    setProgress({ visible: true, message, percent: 0, isRunning: true });
  }, []);

  /** 進捗率のみ更新する（onProgressコールバックから呼ばれる想定） */
  const updatePercent = useCallback((percent: number) => {
    setProgress((prev) => ({ ...prev, percent }));
  }, []);

  /** メッセージのみ更新する（フェーズ切り替え時など） */
  const updateMessage = useCallback((message: string) => {
    setProgress((prev) => ({ ...prev, message }));
  }, []);

  /** 任意のフィールドをまとめて更新する */
  const update = useCallback((patch: Partial<ProgressState>) => {
    setProgress((prev) => ({ ...prev, ...patch }));
  }, []);

  /** 完了状態にする（percent=100, isRunning=false） */
  const finish = useCallback((message: string) => {
    setProgress((prev) => ({
      ...prev,
      percent: 100,
      message,
      isRunning: false,
    }));
  }, []);

  /** 実行中フラグのみ false にする（エラー時の中断など） */
  const stopRunning = useCallback(() => {
    setProgress((prev) => ({ ...prev, isRunning: false }));
  }, []);

  /** 初期状態にリセットする */
  const reset = useCallback(() => {
    setProgress(INITIAL_PROGRESS);
  }, []);

  return {
    progress,
    start,
    updatePercent,
    updateMessage,
    update,
    finish,
    stopRunning,
    reset,
  };
}