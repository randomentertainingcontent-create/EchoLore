import { cn } from "@/lib/utils";

/** EchoLore brand mark — a stylized "echo ripple" inside a flame ember. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("h-8 w-8", className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="el-ember-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="oklch(0.84 0.17 55)" />
          <stop offset="100%" stopColor="oklch(0.58 0.18 35)" />
        </linearGradient>
      </defs>
      {/* Outer flame */}
      <path
        d="M16 2 C 18 6, 23 8, 23 14 C 23 19, 20 22, 16 22 C 12 22, 9 19, 9 14 C 9 10, 12 8, 13 6 Z"
        fill="url(#el-ember-grad)"
        opacity="0.9"
      />
      {/* Echo ripples */}
      <circle cx="16" cy="14" r="2.5" fill="oklch(0.16 0.012 250)" />
      <circle cx="16" cy="14" r="5"   fill="none" stroke="oklch(0.16 0.012 250)" strokeWidth="1" opacity="0.55" />
      <circle cx="16" cy="14" r="7.5" fill="none" stroke="oklch(0.16 0.012 250)" strokeWidth="1" opacity="0.30" />
    </svg>
  );
}

export function BrandWordmark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <BrandMark className="h-7 w-7" />
      <div className="flex flex-col leading-none">
        <span className="text-base font-semibold tracking-tight text-foreground">
          Echo<span className="text-primary">Lore</span>
        </span>
        <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          BYOK · RAG roleplay
        </span>
      </div>
    </div>
  );
}
