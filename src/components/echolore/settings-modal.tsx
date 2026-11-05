"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2, ExternalLink, Eye, EyeOff, Loader2, Settings2, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { useByokStore, DEFAULT_BYOK } from "@/store/byok-store";
import { usePrefsStore, DEFAULT_PREFS, type StoryFont, type TextSize } from "@/store/prefs-store";
import { useToast } from "@/hooks/use-toast";
import { useMounted } from "@/hooks/use-mounted";
import { buildAuthHeaders, EMBED_MODEL, HDR_OPENROUTER_KEY } from "@/lib/byok/headers";
import { cn } from "@/lib/utils";
import type { ResponseLength } from "@/types/echolore";
import { ModelPicker } from "./model-picker";

export type SettingsTab = "connection" | "models" | "story";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: SettingsTab;
}

export function SettingsModal({ open, onOpenChange, initialTab = "connection" }: SettingsModalProps) {
  const mounted = useMounted();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="el-dialog max-h-[calc(100dvh-2rem)] max-w-[calc(100%-2rem)] overflow-y-auto border-border bg-card sm:max-w-xl el-scroll">
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2 pr-8 text-xl"><Settings2 className="h-5 w-5 shrink-0 text-primary" /> Settings</DialogTitle>
          <DialogDescription className="leading-relaxed">Your OpenRouter key, the models that tell your story, and how it reads. Changes save automatically in this browser.</DialogDescription>
        </DialogHeader>
        {mounted && open && <SettingsFields key={initialTab} initialTab={initialTab} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

type KeyStatus = { state: "idle" } | { state: "checking" } | { state: "ok"; detail: string } | { state: "bad"; detail: string };

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string; hint?: string }[]; onChange: (value: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-flow-col gap-1 rounded-lg bg-muted p-1" style={{ gridAutoColumns: "1fr" }}>
      {options.map((option) => (
        <button key={option.value} type="button" role="radio" aria-checked={value === option.value} onClick={() => onChange(option.value)}
          className={cn("min-h-10 rounded-md px-2 py-1.5 text-sm transition-colors", value === option.value ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
          {option.label}
          {option.hint && <span className="block text-[11px] font-normal text-muted-foreground">{option.hint}</span>}
        </button>
      ))}
    </div>
  );
}

function SettingsFields({ onDone, initialTab }: { onDone: () => void; initialTab: SettingsTab }) {
  const { config, setOpenrouterKey, setChatModel, setLoreModel, clearAll } = useByokStore();
  const prefs = usePrefsStore();
  const { toast } = useToast();
  const [show, setShow] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [keyStatus, setKeyStatus] = useState<KeyStatus>({ state: "idle" });

  async function testKey() {
    setKeyStatus({ state: "checking" });
    try {
      const res = await fetch("/api/key-check", { method: "POST", headers: { ...await buildAuthHeaders(), [HDR_OPENROUTER_KEY]: config.openrouterKey } });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not check the key.");
      if (!body.ok) { setKeyStatus({ state: "bad", detail: body.error }); return; }
      const credit = typeof body.limitRemaining === "number" ? ` · $${body.limitRemaining.toFixed(2)} limit remaining` : typeof body.usage === "number" ? ` · $${body.usage.toFixed(2)} used` : "";
      setKeyStatus({ state: "ok", detail: `Key works${body.label ? ` (${body.label})` : ""}${body.freeTier ? " · free tier" : ""}${credit}.` });
    } catch (e) {
      setKeyStatus({ state: "bad", detail: e instanceof Error ? e.message : "Could not check the key." });
    }
  }

  return (
    <>
      <Tabs defaultValue={initialTab} className="gap-4">
        <TabsList className="w-full">
          <TabsTrigger value="connection" className="flex-1">Connection</TabsTrigger>
          <TabsTrigger value="models" className="flex-1">Models</TabsTrigger>
          <TabsTrigger value="story" className="flex-1">Storytelling</TabsTrigger>
        </TabsList>

        <TabsContent value="connection" className="grid gap-5">
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="or-key">OpenRouter API key</Label>
              <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 py-1 text-sm text-primary underline-offset-4 hover:underline">Get a free key <ExternalLink className="h-3 w-3" /><span className="sr-only"> (opens in new tab)</span></a>
            </div>
            <div className="relative">
              <Input id="or-key" type={show ? "text" : "password"} placeholder="sk-or-v1-…" value={config.openrouterKey} maxLength={512} onChange={(event) => { setOpenrouterKey(event.target.value); setKeyStatus({ state: "idle" }); }} autoComplete="off" autoCapitalize="none" spellCheck={false} aria-describedby="key-hint" className="h-11 pr-12 font-mono text-base sm:text-sm" />
              <button type="button" onClick={() => setShow((value) => !value)} className="absolute inset-y-0 right-0 w-11 rounded-md text-muted-foreground hover:text-foreground" aria-label={show ? "Hide key" : "Show key"} aria-pressed={show}>{show ? <EyeOff className="mx-auto h-4 w-4" /> : <Eye className="mx-auto h-4 w-4" />}</button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="outline" size="sm" onClick={() => void testKey()} disabled={!config.openrouterKey.trim() || keyStatus.state === "checking"} className="gap-1.5">
                {keyStatus.state === "checking" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />} Test key
              </Button>
              {keyStatus.state === "ok" && <p role="status" className="flex items-center gap-1.5 text-xs text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5 shrink-0" />{keyStatus.detail}</p>}
              {keyStatus.state === "bad" && <p role="alert" className="flex items-center gap-1.5 text-xs text-destructive"><XCircle className="h-3.5 w-3.5 shrink-0" />{keyStatus.detail}</p>}
            </div>
            <p id="key-hint" className="text-xs leading-relaxed text-muted-foreground">{config.openrouterKey.trim() ? "Key saved on this browser." : "A key is required to chat. Creating a world does not require one. Free models cost nothing."}</p>
          </div>
          <div className="rounded-lg border border-border p-3 text-xs leading-6 text-muted-foreground">
            <p>Your key stays in this browser’s storage and is sent through EchoLore’s server to OpenRouter only when used. It’s never saved on the server, and it’s removed when you sign out.</p>
            <p className="mt-1">OpenRouter charges apply to paid models, including small embedding costs for story memory.</p>
          </div>
          {confirmClear ? (
            <div className="rounded-md border border-border p-3 text-sm"><p>Remove the saved key and reset model settings on this browser? Worlds and messages are kept. This doesn’t revoke the key at OpenRouter.</p><div className="mt-3 flex flex-wrap gap-2"><Button variant="destructive" size="sm" onClick={() => { clearAll(); setShow(false); setConfirmClear(false); setKeyStatus({ state: "idle" }); toast({ title: "API settings reset", description: "Saved key removed and models reset on this browser." }); }}>Clear and reset</Button><Button variant="outline" size="sm" onClick={() => setConfirmClear(false)}>Keep settings</Button></div></div>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setConfirmClear(true)} className="justify-self-start gap-1.5 text-muted-foreground"><Trash2 className="h-3.5 w-3.5" /> Clear key and reset models</Button>
          )}
        </TabsContent>

        <TabsContent value="models" className="grid gap-5">
          <div className="grid gap-2">
            <Label htmlFor="chat-model">Story model</Label>
            <ModelPicker id="chat-model" value={config.chatModel} onChange={setChatModel} placeholder={DEFAULT_BYOK.chatModel} describedBy="chat-model-hint" />
            <p id="chat-model-hint" className="text-xs leading-relaxed text-muted-foreground">Writes every reply. Bigger, more creative models tell better stories; free models can be rate-limited at busy times.</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="lore-model">Lorebook model</Label>
            <ModelPicker id="lore-model" value={config.loreModel} onChange={setLoreModel} placeholder={DEFAULT_BYOK.loreModel} describedBy="lore-model-hint" />
            <p id="lore-model-hint" className="text-xs leading-relaxed text-muted-foreground">Quietly updates the lorebook every couple of turns. A small, fast, cheap model works well.</p>
          </div>
          <p className="text-xs text-muted-foreground">Memory search uses <span className="font-mono">{EMBED_MODEL}</span> (fixed, so past memories stay searchable).</p>
          <Button variant="link" className="h-auto justify-self-start px-0 py-1 text-sm" onClick={() => { setChatModel(DEFAULT_BYOK.chatModel); setLoreModel(DEFAULT_BYOK.loreModel); }}>Reset to free defaults</Button>
        </TabsContent>

        <TabsContent value="story" className="grid gap-6">
          <div className="grid gap-2">
            <Label>Reply length</Label>
            <Segmented<ResponseLength> label="Reply length" value={prefs.responseLength} onChange={prefs.setResponseLength} options={[{ value: "short", label: "Short", hint: "Snappy" }, { value: "medium", label: "Medium", hint: "Balanced" }, { value: "long", label: "Long", hint: "Novel-like" }]} />
          </div>
          <div className="grid gap-3">
            <div className="flex items-center justify-between"><Label htmlFor="creativity">Creativity</Label><span className="text-xs tabular-nums text-muted-foreground">{prefs.creativity.toFixed(2)} · {prefs.creativity < 0.55 ? "Focused" : prefs.creativity <= 1 ? "Balanced" : "Wild"}</span></div>
            <Slider id="creativity" aria-label="Creativity" min={0.2} max={1.4} step={0.05} value={[prefs.creativity]} onValueChange={([value]) => prefs.setCreativity(value)} />
            <p className="text-xs text-muted-foreground">Lower keeps the narrator consistent and grounded; higher makes it more surprising (and occasionally chaotic).</p>
          </div>
          <div className="grid gap-2">
            <Label>Story font</Label>
            <Segmented<StoryFont> label="Story font" value={prefs.storyFont} onChange={prefs.setStoryFont} options={[{ value: "serif", label: "Book serif" }, { value: "sans", label: "Clean sans" }]} />
          </div>
          <div className="grid gap-2">
            <Label>Text size</Label>
            <Segmented<TextSize> label="Text size" value={prefs.textSize} onChange={prefs.setTextSize} options={[{ value: "sm", label: "S" }, { value: "md", label: "M" }, { value: "lg", label: "L" }, { value: "xl", label: "XL" }]} />
          </div>
          <Button variant="link" className="h-auto justify-self-start px-0 py-1 text-sm" onClick={() => prefs.reset()} disabled={prefs.responseLength === DEFAULT_PREFS.responseLength && prefs.creativity === DEFAULT_PREFS.creativity && prefs.textSize === DEFAULT_PREFS.textSize && prefs.storyFont === DEFAULT_PREFS.storyFont}>Reset storytelling settings</Button>
        </TabsContent>
      </Tabs>
      <DialogFooter>
        <Button onClick={onDone}>Done</Button>
      </DialogFooter>
    </>
  );
}
