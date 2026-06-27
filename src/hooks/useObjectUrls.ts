import { useCallback, useEffect, useRef } from "react";

/**
 * createObjectURL で生成したURLを追跡し、明示的に解放するためのHook。
 * Object URL はコンポーネントのライフサイクルを越えて残るため、
 * 生成したものをすべて記録し、リセット時・アンマウント時に revokeObjectURL する。
 */
export function useObjectUrls() {
  const urlsRef = useRef<string[]>([]);

  /** Blob から Object URL を生成し、追跡リストに追加して返す */
  const createUrl = useCallback((blob: Blob): string => {
    const url = URL.createObjectURL(blob);
    urlsRef.current.push(url);
    return url;
  }, []);

  /** 追跡中のURLをすべて解放する */
  const revokeAll = useCallback(() => {
    urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    urlsRef.current = [];
  }, []);

  // アンマウント時にも確実に解放する
  useEffect(() => {
    return () => revokeAll();
  }, [revokeAll]);

  return { createUrl, revokeAll };
}