import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

/**
 * デザインシステム — 共通UIプリミティブ
 *
 * コンセプト「現像 (developing)」:
 *   画像の中に隠れているデータは、写真の現像液に浸した印画紙のように
 *   "そこにあるが目に見えない"層。藍色(plate)を地に、
 *   現像液を思わせる琥珀(amber)を一点だけのアクセントとして使う。
 *
 * トークン:
 *   --plate-950/900/800/700  : 藍系ベース（紙・基調）
 *   --amber-500/400          : アクセント（実行・強調・進捗）
 *   --signal-rose            : エラー/危険
 *   --signal-teal            : 成功/検証OK
 */

export function Card({
  className = "",
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={`rounded-2xl border border-plate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.08)] dark:border-plate-700 dark:bg-plate-850 ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionLabel({
  index,
  children,
}: {
  index: number;
  children: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-xs font-bold tabular-nums text-amber-600 dark:text-amber-400">
        {index}
      </span>
      <h3 className="text-sm font-semibold tracking-wide text-plate-600 uppercase dark:text-plate-300">
        {children}
      </h3>
    </div>
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  size?: "md" | "lg";
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500";
  const sizes =
    size === "lg" ? "px-6 py-3.5 text-[15px]" : "px-4 py-2.5 text-sm";
  const variants: Record<typeof variant, string> = {
    primary:
      "bg-plate-900 text-white hover:bg-plate-800 active:bg-plate-950 dark:bg-amber-500 dark:text-plate-950 dark:hover:bg-amber-400",
    secondary:
      "bg-plate-100 text-plate-800 hover:bg-plate-200 dark:bg-plate-700 dark:text-plate-100 dark:hover:bg-plate-600",
    ghost:
      "bg-transparent text-plate-600 hover:bg-plate-100 dark:text-plate-300 dark:hover:bg-plate-800",
  };

  return (
    <button
      {...rest}
      className={`${base} ${sizes} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "amber" | "rose" | "teal";
  children: ReactNode;
}) {
  const tones: Record<typeof tone, string> = {
    neutral:
      "bg-plate-100 text-plate-700 dark:bg-plate-700 dark:text-plate-200",
    amber: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    teal: "bg-teal-500/10 text-teal-700 dark:text-teal-400",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Alert({
  tone = "rose",
  children,
}: {
  tone?: "rose" | "amber" | "teal";
  children: ReactNode;
}) {
  const tones: Record<typeof tone, string> = {
    rose: "border-rose-500/30 bg-rose-500/5 text-rose-700 dark:text-rose-300",
    amber:
      "border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-300",
    teal: "border-teal-500/30 bg-teal-500/5 text-teal-700 dark:text-teal-300",
  };
  return (
    <div
      role="alert"
      className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium ${tones[tone]}`}
    >
      {children}
    </div>
  );
}

/** 円形の現像インジケーター。Embed/Extract実行中の演出に使う最小限のモーション。 */
export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current/20 border-t-current ${className}`}
    />
  );
}

export function Tooltip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 scale-95 rounded-lg bg-plate-900 px-2.5 py-1.5 text-xs whitespace-nowrap text-white opacity-0 shadow-lg transition-all duration-100 group-hover:scale-100 group-hover:opacity-100 dark:bg-plate-100 dark:text-plate-900">
        {label}
      </span>
    </span>
  );
}

/** ステップ番号付きの進行インジケーター（カード上部のタブ内で使用） */
export function StepDots({
  total,
  current,
}: {
  total: number;
  current: number;
}) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden="true">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            i < current
              ? "w-6 bg-amber-500"
              : i === current
                ? "w-6 bg-plate-400 dark:bg-plate-500"
                : "w-1.5 bg-plate-200 dark:bg-plate-700"
          }`}
        />
      ))}
    </div>
  );
}