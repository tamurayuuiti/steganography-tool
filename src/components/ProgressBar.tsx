import type { ProgressState } from "../types";
import { Spinner } from "./ui";

interface ProgressBarProps {
  progress: ProgressState;
  /** 経過時間表示（埋め込み側のみ使用。抽出側では未指定） */
  elapsedTime?: string;
}

/** 処理中のメッセージ・経過時間・進捗率バーを表示する共通コンポーネント */
function ProgressBar({ progress, elapsedTime }: ProgressBarProps) {
  if (!progress.visible) return null;

  const pct = Math.min(progress.percent, 100);
  const isDone = !progress.isRunning && pct >= 100;

  return (
    <div className="mt-4 rounded-xl bg-plate-50 p-4 dark:bg-plate-800/60">
      <div className="flex items-center text-sm">
        {progress.isRunning && (
          <Spinner className="mr-2 text-amber-500" />
        )}
        <span
          className={`font-medium ${
            isDone
              ? "text-teal-700 dark:text-teal-400"
              : "text-plate-700 dark:text-plate-200"
          }`}
        >
          {progress.message}
        </span>
        {elapsedTime !== undefined && (
          <span className="ml-auto font-mono text-xs text-plate-500 dark:text-plate-400">
            {elapsedTime}
          </span>
        )}
      </div>

      <div className="relative mt-3 h-2 w-full overflow-hidden rounded-full bg-plate-200 dark:bg-plate-700">
        <div
          className={`h-full rounded-full transition-[width] duration-150 ease-out ${
            isDone ? "bg-teal-500" : "bg-amber-500"
          }`}
          style={{ width: `${pct.toFixed(1)}%` }}
        />
      </div>
      <div className="mt-1.5 text-right text-xs font-mono text-plate-500 dark:text-plate-400">
        {pct.toFixed(1)}%
      </div>
    </div>
  );
}

export default ProgressBar;