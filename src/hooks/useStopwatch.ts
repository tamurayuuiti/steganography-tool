import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 経過時間を計測するストップウォッチHook。
 * requestAnimationFrame で経過時間を更新し、アンマウント時に確実に停止する。
 */
export function useStopwatch() {
  const [elapsedTime, setElapsedTime] = useState<string>("0.00s");
  const startTimeRef = useRef<number>(0);
  const animationFrameIdRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (animationFrameIdRef.current !== null) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    startTimeRef.current = Date.now();
    const update = () => {
      const diff = (Date.now() - startTimeRef.current) / 1000;
      setElapsedTime(`${diff.toFixed(2)}s`);
      animationFrameIdRef.current = requestAnimationFrame(update);
    };
    update();
  }, []);

  // アンマウント時にアニメーションフレームを確実に解放する
  useEffect(() => {
    return () => stop();
  }, [stop]);

  return { elapsedTime, start, stop };
}