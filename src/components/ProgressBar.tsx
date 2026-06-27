import type { ProgressState } from "../types";

interface ProgressBarProps {
  progress: ProgressState;
  /** 経過時間表示（埋め込み側のみ使用。抽出側では未指定） */
  elapsedTime?: string;
}

/** 処理中のメッセージ・経過時間・進捗率バーを表示する共通コンポーネント */
function ProgressBar({ progress, elapsedTime }: ProgressBarProps) {
  if (!progress.visible) return null;

  return (
    <>
      <div className="mt-4 flex items-center">
        {progress.isRunning && (
          <span className="mr-2.5 inline-block h-5 w-5 animate-spin rounded-full border-4 border-black/10 border-l-emerald-500 align-middle dark:border-white/10 dark:border-l-emerald-500" />
        )}
        <span className="font-bold">{progress.message}</span>
        {elapsedTime !== undefined && (
          <span className="ml-auto font-mono">{elapsedTime}</span>
        )}
      </div>

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
    </>
  );
}

export default ProgressBar;