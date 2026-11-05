"use client";

import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { BookOpen, Check, Loader2, Pencil, RefreshCw, ScrollText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useCampaignStore } from "@/store/campaign-store";
import { cn } from "@/lib/utils";
import type { Campaign } from "@/types/echolore";

const METER_KEYS = /^(health|hp|sanity|oxygen|o2|energy|stamina|mana|morale|hunger|thirst|fatigue|stress|trust|affection|hope|courage|battery)$/i;

function humanize(key: string) {
  const spaced = key.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function isPrimitive(value: unknown): value is string | number | boolean | null {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

function Primitive({ value }: { value: string | number | boolean | null }) {
  if (value === null || value === "") return <span className="text-muted-foreground">—</span>;
  if (typeof value === "boolean") return <span>{value ? "Yes" : "No"}</span>;
  return <span className="break-words">{String(value)}</span>;
}

function Meter({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const tone = pct > 60 ? "bg-emerald-400" : pct > 30 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className={cn("h-full rounded-full transition-all", tone)} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-9 text-right text-xs tabular-nums">{value}</span>
    </div>
  );
}

function LoreValue({ name, value, depth }: { name: string; value: unknown; depth: number }) {
  if (typeof value === "number" && METER_KEYS.test(name) && value >= 0 && value <= 100) return <Meter value={value} />;
  if (isPrimitive(value)) return <Primitive value={value} />;
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted-foreground">None</span>;
    if (value.every(isPrimitive)) {
      return (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((item, index) => <li key={index} className="rounded-md border border-border bg-background/60 px-2 py-0.5 text-xs leading-5"><Primitive value={item} /></li>)}
        </ul>
      );
    }
    return (
      <ol className="grid gap-2">
        {value.map((item, index) => (
          <li key={index} className="rounded-md border border-border/70 p-2">
            <LoreValue name={`${name} ${index + 1}`} value={item} depth={depth + 1} />
          </li>
        ))}
      </ol>
    );
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return <span className="text-muted-foreground">None yet</span>;
    return (
      <dl className={cn("grid gap-2", depth > 0 && "border-l border-border pl-3")}>
        {entries.map(([key, child]) => (
          <div key={key} className="grid gap-1">
            <dt className="text-xs text-muted-foreground">{humanize(key)}</dt>
            <dd className="text-sm"><LoreValue name={key} value={child} depth={depth + 1} /></dd>
          </div>
        ))}
      </dl>
    );
  }
  return <span className="text-muted-foreground">—</span>;
}

interface LorebookPanelProps {
  campaign: Campaign;
  worldStateJson: string | null;
  updatedAt: string | null;
  pending: boolean;
  onRefresh: () => void;
  onEditWorld: () => void;
  className?: string;
}

export function LorebookPanel({ campaign, worldStateJson, updatedAt, pending, onRefresh, onEditWorld, className }: LorebookPanelProps) {
  const saveLore = useCampaignStore((s) => s.saveLore);
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const parsed = useMemo(() => {
    if (worldStateJson === null) return null;
    try {
      const value: unknown = JSON.parse(worldStateJson);
      return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
    } catch { return null; }
  }, [worldStateJson]);
  const updated = updatedAt ? new Date(updatedAt) : null;

  function startEdit() {
    setDraft(JSON.stringify(parsed ?? {}, null, 2));
    setError(null);
    setEditing(true);
  }

  async function save() {
    let state: unknown;
    try { state = draft.trim() ? JSON.parse(draft) : {}; }
    catch { setError("Invalid JSON. Check quotes, commas and brackets."); return; }
    if (!state || typeof state !== "object" || Array.isArray(state)) { setError("The lorebook must be a JSON object, like {\"location\": \"…\"}."); return; }
    setSaving(true);
    setError(null);
    try {
      await saveLore(campaign.id, state as Record<string, unknown>);
      setEditing(false);
      toast({ title: "Lorebook saved", description: "The narrator will treat these details as fact." });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the lorebook.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section id="world-lorebook" aria-label="World lorebook" className={cn("flex min-h-0 flex-col bg-card", className)}>
      <Tabs defaultValue="state" className="flex min-h-0 flex-1 flex-col gap-0">
        <div className="shrink-0 border-b border-border px-4 pb-3 pt-4">
          <div className="flex items-center gap-2 pr-10">
            <BookOpen className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Lorebook</h2>
            {pending && <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-primary" role="status"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Updating</span>}
          </div>
          <TabsList className="mt-3 w-full">
            <TabsTrigger value="state" className="flex-1">State</TabsTrigger>
            <TabsTrigger value="world" className="flex-1">World</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="state" className="min-h-0 overflow-y-auto px-4 py-4 el-scroll">
          {editing ? (
            <div className="grid gap-2">
              <Label htmlFor="lore-json">Lorebook JSON</Label>
              <Textarea id="lore-json" value={draft} onChange={(event) => { setDraft(event.target.value); setError(null); }} spellCheck={false} rows={14} maxLength={16000} className="font-mono text-xs leading-relaxed el-scroll" aria-invalid={Boolean(error)} />
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void save()} disabled={saving} className="gap-1.5">{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving} className="gap-1.5"><X className="h-3.5 w-3.5" /> Cancel</Button>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">Edits replace the lorebook. The keeper keeps updating it every couple of turns.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {parsed === null ? (
                <p className="text-sm text-muted-foreground">{worldStateJson === null ? "Loading the lorebook…" : "This lorebook couldn’t be read."}</p>
              ) : Object.keys(parsed).length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-4 text-sm leading-relaxed text-muted-foreground">
                  <ScrollText className="mb-2 h-5 w-5 text-primary" />
                  Nothing written down yet. Every couple of turns the keeper notes where you are, what you carry, your goals and the people you meet. You can add details yourself too.
                </div>
              ) : (
                <LoreValue name="root" value={parsed} depth={0} />
              )}
              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                <Button size="sm" variant="outline" onClick={startEdit} className="gap-1.5"><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                <Button size="sm" variant="ghost" onClick={onRefresh} className="gap-1.5"><RefreshCw className="h-3.5 w-3.5" /> Refresh</Button>
                {updated && !Number.isNaN(updated.getTime()) && <span className="ml-auto text-xs text-muted-foreground">Updated {formatDistanceToNow(updated, { addSuffix: true })}</span>}
              </div>
            </div>
          )}
        </TabsContent>
        <TabsContent value="world" className="min-h-0 overflow-y-auto px-4 py-4 el-scroll">
          <dl className="grid gap-4 text-sm leading-relaxed">
            <div><dt className="text-xs font-medium uppercase tracking-wide text-primary">World</dt><dd className="mt-1 whitespace-pre-wrap text-muted-foreground">{campaign.worldDescription}</dd></div>
            <div><dt className="text-xs font-medium uppercase tracking-wide text-primary">You</dt><dd className="mt-1 whitespace-pre-wrap text-muted-foreground">{campaign.userPersona}</dd></div>
            <div><dt className="text-xs font-medium uppercase tracking-wide text-primary">Narrator</dt><dd className="mt-1 whitespace-pre-wrap text-muted-foreground">{campaign.aiPersona}</dd></div>
          </dl>
          <Button size="sm" variant="outline" onClick={onEditWorld} className="mt-4 gap-1.5"><Pencil className="h-3.5 w-3.5" /> Edit world</Button>
        </TabsContent>
      </Tabs>
    </section>
  );
}
