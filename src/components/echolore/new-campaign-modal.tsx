"use client";

import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Flame, Loader2, Wand2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCampaignStore } from "@/store/campaign-store";
import { useMockUser } from "@/hooks/use-mock-user";
import { cn } from "@/lib/utils";
import { WORLD_TEMPLATES, type WorldTemplate } from "./presets";
import { Sigil } from "./pixel-art";
import type { NewCampaignInput } from "@/types/echolore";

interface NewCampaignModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (campaignId: string) => void;
  /** Open straight onto the details step, prefilled from this template. */
  initialTemplate?: WorldTemplate | null;
}

type Form = Omit<NewCampaignInput, "startingState">;
const EMPTY_FORM: Form = { title: "", worldDescription: "", userPersona: "", aiPersona: "" };
const SIMPLE_KEYS = ["location", "inventory", "active_quests"];

export const WORLD_FIELDS = [
  { key: "worldDescription", id: "nc-world", label: "World description", max: 8000, rows: 4, minWords: 15, hint: "The setting, era, tone and rules. A few vivid sentences go a long way.", placeholder: "A rain-soaked city ruled by rival megacorps, where the net is more real than the street…" },
  { key: "userPersona", id: "nc-user", label: "Your persona", max: 4000, rows: 3, minWords: 10, hint: "Who you play: background, skills, what you want, what you fear.", placeholder: "I'm a rogue netrunner with a chrome arm and a debt to the Triad…" },
  { key: "aiPersona", id: "nc-ai", label: "Narrator’s role", max: 4000, rows: 3, minWords: 10, hint: "A narrator / Game Master, or a specific character you talk to. Describe their voice.", placeholder: "You are the Game Master. Voice every character and keep the tone gritty and noir…" },
] as const;

export function wordCount(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export function NewCampaignModal({ open, onOpenChange, onCreated, initialTemplate }: NewCampaignModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <NewCampaignBody onOpenChange={onOpenChange} onCreated={onCreated} initialTemplate={initialTemplate} />}
    </Dialog>
  );
}

function templateForm(template: WorldTemplate | null | undefined): Form {
  if (!template) return EMPTY_FORM;
  const { title, worldDescription, userPersona, aiPersona } = template;
  return { title, worldDescription, userPersona, aiPersona };
}

function NewCampaignBody({ onOpenChange, onCreated, initialTemplate }: Omit<NewCampaignModalProps, "open">) {
  const { userId, ready } = useMockUser();
  const create = useCampaignStore((s) => s.create);
  const { toast } = useToast();
  const [step, setStep] = useState<"choose" | "details">(initialTemplate ? "details" : "choose");
  const [template, setTemplate] = useState<WorldTemplate | null>(initialTemplate ?? null);
  const [form, setForm] = useState<Form>(() => templateForm(initialTemplate));
  const [jsonMode, setJsonMode] = useState(Boolean(initialTemplate));
  const [simple, setSimple] = useState({ location: "", inventory: "", goal: "" });
  const [stateText, setStateText] = useState(() => (initialTemplate ? JSON.stringify(initialTemplate.startingState, null, 2) : ""));
  const [stateError, setStateError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const stateRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  function begin(next: WorldTemplate | null) {
    setTemplate(next);
    setSaveError(null);
    setStateError(null);
    if (next) {
      setForm(templateForm(next));
      setStateText(JSON.stringify(next.startingState, null, 2));
      setJsonMode(true);
    } else {
      setForm(EMPTY_FORM);
      setStateText("");
      setSimple({ location: "", inventory: "", goal: "" });
      setJsonMode(false);
    }
    setStep("details");
    requestAnimationFrame(() => titleRef.current?.focus());
  }

  function simpleState(): Record<string, unknown> {
    const state: Record<string, unknown> = {};
    if (simple.location.trim()) state.location = simple.location.trim();
    const items = simple.inventory.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
    if (items.length) state.inventory = items;
    if (simple.goal.trim()) state.active_quests = [simple.goal.trim()];
    return state;
  }

  function toggleJson() {
    if (!jsonMode) {
      const state = simpleState();
      setStateText(Object.keys(state).length ? JSON.stringify(state, null, 2) : "");
      setJsonMode(true);
      setStateError(null);
      return;
    }
    try {
      const parsed: unknown = stateText.trim() ? JSON.parse(stateText) : {};
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      const record = parsed as Record<string, unknown>;
      if (Object.keys(record).some((key) => !SIMPLE_KEYS.includes(key))) {
        setStateError("This starting state has extra fields, so keep editing it as JSON (or clear it first).");
        return;
      }
      const list = (value: unknown) => (Array.isArray(value) ? value.map(String).join(", ") : typeof value === "string" ? value : "");
      setSimple({ location: typeof record.location === "string" ? record.location : "", inventory: list(record.inventory), goal: list(record.active_quests) });
      setJsonMode(false);
      setStateError(null);
    } catch {
      setStateError("Fix the JSON (or clear it) before switching back to simple fields.");
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || !userId || pending.current) return;
    if (![form.title, form.worldDescription, form.userPersona, form.aiPersona].every((value) => value.trim())) {
      setSaveError("Required fields cannot contain only spaces.");
      return;
    }
    let startingState: Record<string, unknown>;
    if (jsonMode) {
      try {
        const parsed: unknown = stateText.trim() ? JSON.parse(stateText) : {};
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("Use a JSON object, such as {\"location\": \"The gates\"}, or leave this blank.");
        startingState = parsed as Record<string, unknown>;
        setStateError(null);
      } catch (error) {
        setStateError(error instanceof SyntaxError ? "Invalid JSON. Check double quotes, commas, and brackets, or leave this blank." : (error as Error).message);
        stateRef.current?.focus();
        return;
      }
    } else startingState = simpleState();
    pending.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const campaign = await create(userId, {
        title: form.title.trim(), worldDescription: form.worldDescription.trim(),
        userPersona: form.userPersona.trim(), aiPersona: form.aiPersona.trim(), startingState,
      });
      toast({ title: "World created", description: `${campaign.title} is ready when you are.` });
      onOpenChange(false);
      onCreated?.(campaign.id);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not create your world. Your entries are kept; please try again.");
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return (
    <DialogContent
      showCloseButton={!saving}
      onInteractOutside={(event) => { if (pending.current || step === "details") event.preventDefault(); }}
      onEscapeKeyDown={(event) => { if (pending.current) event.preventDefault(); }}
      className="el-dialog max-h-[calc(100dvh-2rem)] max-w-[calc(100%-2rem)] overflow-y-auto border-border bg-card sm:max-w-3xl el-scroll"
    >
      <DialogHeader className="text-left">
        <DialogTitle className="flex items-center gap-2 pr-8 text-xl"><Wand2 className="h-5 w-5 shrink-0 text-primary" /> Forge a new world</DialogTitle>
        <DialogDescription className="leading-relaxed">
          {step === "choose" ? "Pick a starting point. You can change every detail on the next step." : template ? `Starting from ${template.label}. Change anything you like.` : "Describe your world, who you are, and who tells the story."}
        </DialogDescription>
      </DialogHeader>

      {step === "choose" ? (
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => begin(null)} className="el-template group flex items-start gap-3 rounded-md border border-dashed border-primary/50 p-4 text-left">
              <Sigil id="blank" className="h-8 w-8 shrink-0" />
              <span className="min-w-0">
                <span className="block font-medium">Start from scratch</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">A blank page. Write any world you can imagine.</span>
              </span>
            </button>
            <button type="button" onClick={() => begin(WORLD_TEMPLATES[Math.floor(Math.random() * WORLD_TEMPLATES.length)])} className="el-template group flex items-start gap-3 rounded-md border border-border p-4 text-left">
              <Sigil id="dice" className="h-8 w-8 shrink-0" />
              <span className="min-w-0">
                <span className="block font-medium">Surprise me</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">Roll a random template and jump right in.</span>
              </span>
            </button>
          </div>
          <h3 className="pt-2 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">Templates</h3>
          <ul className="grid gap-3 sm:grid-cols-2">
            {WORLD_TEMPLATES.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => begin(item)} className="el-template flex h-full w-full items-start gap-3 rounded-md border border-border p-4 text-left" aria-label={`${item.label} — ${item.genre}`}>
                  <Sigil id={item.id} className="h-8 w-8 shrink-0" />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium">{item.label}</span>
                      <span className="text-xs text-primary">{item.genre}</span>
                    </span>
                    <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">{item.blurb}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="min-w-0">
          <fieldset disabled={saving} className="grid min-w-0 gap-5">
            <div className="grid gap-2">
              <Label htmlFor="nc-title">World title</Label>
              <Input id="nc-title" ref={titleRef} required maxLength={120} placeholder="e.g. Chrome & Ash" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} className="h-11 text-base sm:text-sm" />
            </div>
            {WORLD_FIELDS.map((field) => {
              const count = wordCount(form[field.key]);
              const thin = count > 0 && count < field.minWords;
              return (
                <div key={field.key} className="grid min-w-0 gap-2">
                  <Label htmlFor={field.id}>{field.label}</Label>
                  <Textarea id={field.id} required rows={field.rows} maxLength={field.max} value={form[field.key]} onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))} placeholder={field.placeholder} aria-describedby={`${field.id}-hint`} className="max-h-60 text-base sm:text-sm el-scroll" />
                  <p id={`${field.id}-hint`} className={cn("text-xs leading-relaxed", thin ? "text-amber-300" : "text-muted-foreground")}>
                    {thin ? `Only ${count} words. A couple more details will make the story noticeably better. ` : `${field.hint} `}
                    <span className="tabular-nums text-muted-foreground">{form[field.key].length.toLocaleString()} / {field.max.toLocaleString()}</span>
                  </p>
                </div>
              );
            })}
            <div className="grid min-w-0 gap-3 rounded-md border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-medium">Starting details <span className="font-normal text-muted-foreground">(optional)</span></h3>
                <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={toggleJson}>{jsonMode ? "Use simple fields" : "Edit as JSON"}</Button>
              </div>
              <p className="-mt-1 text-xs leading-relaxed text-muted-foreground">These seed the lorebook, the story’s record of where you are and what you carry. It updates itself as you play.</p>
              {jsonMode ? (
                <div className="grid min-w-0 gap-2">
                  <Label htmlFor="nc-state">Starting state (JSON)</Label>
                  <Textarea id="nc-state" ref={stateRef} rows={6} maxLength={16000} value={stateText} spellCheck={false} placeholder={'{"location": "The gates", "inventory": []}'} className="max-h-72 font-mono text-sm el-scroll" onChange={(event) => { setStateText(event.target.value); setStateError(null); }} aria-invalid={Boolean(stateError)} aria-describedby={stateError ? "state-hint state-error" : "state-hint"} />
                  <p id="state-hint" className="text-xs leading-relaxed text-muted-foreground">A JSON object, up to 6 levels deep. Leave blank for an empty lorebook.</p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-2 sm:col-span-2"><Label htmlFor="nc-location">Starting location</Label><Input id="nc-location" maxLength={300} value={simple.location} onChange={(event) => setSimple((s) => ({ ...s, location: event.target.value }))} placeholder="Night Market, Sector 7" className="text-base sm:text-sm" /></div>
                  <div className="grid gap-2"><Label htmlFor="nc-inventory">Inventory</Label><Input id="nc-inventory" maxLength={1000} value={simple.inventory} onChange={(event) => setSimple((s) => ({ ...s, inventory: event.target.value }))} placeholder="cyberdeck, pistol, fake ID" className="text-base sm:text-sm" /></div>
                  <div className="grid gap-2"><Label htmlFor="nc-goal">Main goal</Label><Input id="nc-goal" maxLength={500} value={simple.goal} onChange={(event) => setSimple((s) => ({ ...s, goal: event.target.value }))} placeholder="Pay off the Triad debt" className="text-base sm:text-sm" /></div>
                </div>
              )}
              {stateError && <p id="state-error" role="alert" className="text-sm text-destructive">{stateError}</p>}
            </div>
          </fieldset>
          {saveError && <p role="alert" className="mt-4 text-sm text-destructive">Could not create your world: {saveError} Your entries are kept. Review them and try again.</p>}
          <DialogFooter className="mt-6 flex-row flex-wrap gap-2 sm:justify-between">
            <Button type="button" variant="ghost" onClick={() => setStep("choose")} disabled={saving} className="gap-2"><ArrowLeft className="h-4 w-4" /> Templates</Button>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving || !ready || !userId} className="gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flame className="h-4 w-4" />}{saving ? "Creating world…" : "Create world"}</Button>
            </div>
          </DialogFooter>
        </form>
      )}
    </DialogContent>
  );
}
