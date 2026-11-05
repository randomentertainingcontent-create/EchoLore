import { cn } from "@/lib/utils";
import { PixelCampfire, PixelWordmark } from "./pixel-art";

export function BrandMark({ className, animated = false }: { className?: string; animated?: boolean }) {
  return <PixelCampfire className={cn("h-8 w-8", className)} animated={animated} />;
}

export function BrandWordmark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <BrandMark className="h-8 w-8" animated />
      <div className="flex flex-col gap-1.5 leading-none">
        <PixelWordmark className="h-3.5 w-auto" />
        <span className="text-[11px] text-muted-foreground">stories that remember</span>
      </div>
    </div>
  );
}
