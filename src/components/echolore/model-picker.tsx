"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Switch } from "@/components/ui/switch";
import { buildAuthHeaders } from "@/lib/byok/headers";
import { MODEL_ID_PATTERN } from "@/lib/byok/headers";
import { cn } from "@/lib/utils";
import type { ModelSummary } from "@/types/echolore";

let catalogue: Promise<ModelSummary[]> | null = null;

function loadModels(): Promise<ModelSummary[]> {
  catalogue ??= (async () => {
    const res = await fetch("/api/models", { headers: await buildAuthHeaders() });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? "Could not load models");
    return body.models as ModelSummary[];
  })().catch((error) => { catalogue = null; throw error; });
  return catalogue;
}

function price(model: ModelSummary) {
  if (model.free) return "Free";
  if (model.promptPrice === null || model.completionPrice === null) return "";
  const fmt = (n: number) => (n < 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(n < 10 ? 2 : 0)}`);
  return `${fmt(model.promptPrice)} in · ${fmt(model.completionPrice)} out /M`;
}

interface ModelPickerProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  describedBy?: string;
}

export function ModelPicker({ id, value, onChange, placeholder, describedBy }: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<ModelSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [freeOnly, setFreeOnly] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open || models) return;
    let cancelled = false;
    loadModels().then((list) => { if (!cancelled) setModels(list); }).catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Could not load models"); });
    return () => { cancelled = true; };
  }, [open, models]);

  const visible = useMemo(() => {
    const list = (models ?? []).filter((m) => !freeOnly || m.free);
    return list.sort((a, b) => Number(b.free) - Number(a.free) || a.name.localeCompare(b.name)).slice(0, 400);
  }, [models, freeOnly]);
  const current = models?.find((m) => m.id === value);
  const customOk = query.trim() && MODEL_ID_PATTERN.test(query.trim()) && !models?.some((m) => m.id === query.trim());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} aria-describedby={describedBy} className="h-auto min-h-11 w-full justify-between gap-2 px-3 py-2 text-left font-normal">
          <span className="min-w-0">
            <span className="block truncate text-sm">{current?.name ?? (value || placeholder)}</span>
            <span className="block truncate font-mono text-xs text-muted-foreground">{value || placeholder}</span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(28rem,calc(100vw-2rem))] p-0" align="start">
        <Command shouldFilter>
          <CommandInput placeholder="Search models, e.g. claude, llama, free…" value={query} onValueChange={setQuery} />
          <div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs text-muted-foreground">
            <label htmlFor={`${id}-free`} className="flex items-center gap-2"><Switch id={`${id}-free`} checked={freeOnly} onCheckedChange={setFreeOnly} /> Free models only</label>
            {models && <span>{visible.length} models</span>}
          </div>
          <CommandList className="max-h-72 el-scroll">
            {!models && !error && <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading OpenRouter models…</div>}
            {error && <p className="p-4 text-sm text-muted-foreground">{error} You can still type an exact model ID below.</p>}
            {customOk && (
              <CommandGroup heading="Custom">
                <CommandItem value={`custom ${query}`} onSelect={() => { onChange(query.trim()); setOpen(false); }}>Use “{query.trim()}”</CommandItem>
              </CommandGroup>
            )}
            {models && <CommandEmpty>No matching models.</CommandEmpty>}
            {models && (
              <CommandGroup heading="OpenRouter models">
                {visible.map((model) => (
                  <CommandItem key={model.id} value={`${model.name} ${model.id}`} onSelect={() => { onChange(model.id); setOpen(false); }} className="items-start gap-2">
                    <Check className={cn("mt-0.5 h-4 w-4 shrink-0", model.id === value ? "opacity-100 text-primary" : "opacity-0")} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm">{model.name}</span>
                        <span className={cn("shrink-0 text-[11px]", model.free ? "text-emerald-400" : "text-muted-foreground")}>{price(model)}</span>
                      </span>
                      <span className="block truncate font-mono text-[11px] text-muted-foreground">{model.id}{model.contextLength ? ` · ${Math.round(model.contextLength / 1000)}k ctx` : ""}</span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
