"use client";

import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Flame, Wand2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCampaignStore } from "@/store/campaign-store";
import { useMockUser } from "@/hooks/use-mock-user";
import type { NewCampaignInput } from "@/types/echolore";

interface NewCampaignModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (campaignId: string) => void;
}

interface Preset extends NewCampaignInput {
  label: string;
  startingState: Record<string, unknown>;
}

const PRESETS: Preset[] = [
  {
    label: "Cyberpunk Neon",
    title: "Chrome & Ash",
    worldDescription: "A cyberpunk megacity ruled by warring megacorps. The rain never stops, the neon never sleeps, and the net is more real than the street. Augmented mercenaries, black ice, and digital ghosts drift between chrome towers while the undercity rots in acid rain.",
    userPersona: "I am a rogue netrunner with a chrome left arm and a stolen military AI in my head. I owe the Triad a lot of money and I trust almost no one.",
    aiPersona: "You are the Game Master. Describe the environment cinematically, control all NPCs (fixers, corpos, gangers, AIs), and present me with hard choices. Stay gritty and noir.",
    startingState: { location: "Night Market, Sector 7", inventory: ["cyberdeck", "kyber pistol", "fake ID", "0.4 BTC"], health: 100, reputation: "Unknown", active_quests: ["Pay off the Triad debt (50,000€$)"] },
  },
  {
    label: "Dragon Realm",
    title: "The Ironwood Vale",
    worldDescription: "A medieval fantasy world of dragons, fading kingdoms, and old magic. The Ironwood Vale is a forested valley on the frontier, bordered by the Smoking Mountains where the last dragons sleep.",
    userPersona: "I am a humble farmer's child who found a rusted sword in the riverbank. Strange dreams have started, and last night the sword glowed in the dark.",
    aiPersona: "You are the Storyteller. Paint the world with sensory detail, voice every NPC distinctly, and let my choices ripple through the world. Use the world_state to track inventory, location, health, and quests.",
    startingState: { location: "Ironwood Vale — family farmstead", inventory: ["rusted sword", "loaf of bread", "farming clothes"], health: 90, gold: 3, active_quests: ["Discover the origin of the rusted sword"] },
  },
  {
    label: "Deep Space",
    title: "Salvage Rig Sigma-9",
    worldDescription: "The year is 2387. Humanity has spread to a dozen systems. You work a deep-space salvage rig near the abandoned Sigma-9 mining station, where something went silent 40 years ago. Salvage pays well. Curiosity pays more.",
    userPersona: "I am the rig's lead salvager — ex-military, scarred, practical. I carry a pulse rifle and a toolkit. The crew trusts me to make the call when things go wrong.",
    aiPersona: "You are the Game Master. Build dread slowly. Describe the station in sensory detail (smell, sound, gravity). Control the crew NPCs and whatever is lurking on Sigma-9. Track oxygen, ammo, and sanity in world_state.",
    startingState: { location: "Docking airlock, Sigma-9", inventory: ["pulse rifle", "salvage toolkit", "headlamp", "O2 tank (full)"], health: 100, oxygen: 100, sanity: 100, active_quests: ["Find out what silenced Sigma-9"] },
  },
  {
    label: "Cozy Mystery",
    title: "Pinewood Hollow",
    worldDescription: "A small coastal town where everyone knows everyone. The lighthouse keeper just turned up dead and the local sheriff is out of his depth. It's autumn, the leaves are turning, and someone in town is lying.",
    userPersona: "I am a retired big-city homicide detective who moved to Pinewood Hollow for a quiet life. I run the bookshop on Main Street. I notice things.",
    aiPersona: "You are the Storyteller. Cozy mystery tone — atmospheric, character-driven, no on-screen gore. Voice every townsperson distinctly. Drop clues fair and square. Track suspects, clues, and the day/time in world_state.",
    startingState: { location: "Pinewood Hollow — Main Street Books", day: 1, time: "8:14 AM", inventory: ["notebook", "reading glasses", "mug of coffee"], suspects: ["the sheriff", "the lighthouse keeper's niece", "the harbor master"], clues: [], active_quests: ["Solve the lighthouse keeper's murder"] },
  },
];

const EMPTY_FORM: NewCampaignInput = { title: "", worldDescription: "", userPersona: "", aiPersona: "", startingState: {} };

export function NewCampaignModal({ open, onOpenChange, onCreated }: NewCampaignModalProps) {
  const { userId, ready } = useMockUser();
  const create = useCampaignStore((s) => s.create);
  const { toast } = useToast();
  const [form, setForm] = useState<NewCampaignInput>(EMPTY_FORM);
  const [stateText, setStateText] = useState("");
  const [stateError, setStateError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [presetPending, setPresetPending] = useState<Preset | null>(null);
  const pending = useRef(false);
  const stateRef = useRef<HTMLTextAreaElement>(null);

  function applyPreset(preset: Preset) {
    const { title, worldDescription, userPersona, aiPersona, startingState } = preset;
    setForm({ title, worldDescription, userPersona, aiPersona, startingState });
    setStateText(JSON.stringify(startingState, null, 2));
    setStateError(null);
    setPresetPending(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || !userId || pending.current) return;
    if (![form.title, form.worldDescription, form.userPersona, form.aiPersona].every((value) => value.trim())) {
      setSaveError("Required fields cannot contain only spaces.");
      return;
    }
    let startingState: Record<string, unknown>;
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
    pending.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const campaign = await create(userId, { ...form, title: form.title.trim(), worldDescription: form.worldDescription.trim(), userPersona: form.userPersona.trim(), aiPersona: form.aiPersona.trim(), startingState });
      toast({ title: "World created", description: `“${campaign.title}” is ready. The fire is lit.` });
      onOpenChange(false);
      onCreated?.(campaign.id);
      setForm(EMPTY_FORM);
      setStateText("");
      setPresetPending(null);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not create your world. Your entries are kept; please try again.");
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!pending.current) onOpenChange(value); }}>
      <DialogContent showCloseButton={!saving} className="el-dialog max-h-[calc(100dvh-2rem)] max-w-[calc(100%-2rem)] overflow-y-auto bg-card border-border sm:max-w-3xl el-scroll">
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2 pr-6 text-xl"><Wand2 className="h-5 w-5 shrink-0 text-primary" /> Forge a new world</DialogTitle>
          <DialogDescription className="leading-relaxed">Define the setting and your roles. Start from a preset or write your own. All fields except starting state are required.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="min-w-0">
          <fieldset disabled={saving} className="grid min-w-0 gap-6">
            <div>
              <h3 className="mb-3 text-sm font-medium">Start with a setting</h3>
              <div className="flex flex-wrap gap-2">{PRESETS.map((preset) => <Button key={preset.label} type="button" variant="outline" size="sm" onClick={() => { if (form.title || form.worldDescription || form.userPersona || form.aiPersona || stateText) setPresetPending(preset); else applyPreset(preset); }}>{preset.label}</Button>)}</div>
              {presetPending && <div className="mt-3 rounded-md border border-border p-3 text-sm" role="group" aria-label="Replace draft with preset"><p>Replace your current entries with {presetPending.label}?</p><div className="mt-2 flex flex-wrap gap-2"><Button type="button" size="sm" onClick={() => applyPreset(presetPending)}>Use preset</Button><Button type="button" variant="ghost" size="sm" onClick={() => setPresetPending(null)}>Keep my entries</Button></div></div>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="nc-title">World title</Label>
              <Input id="nc-title" required maxLength={120} placeholder="e.g. Chrome & Ash" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} aria-describedby="title-hint" />
              <p id="title-hint" className="text-xs text-muted-foreground">Up to 120 characters.</p>
            </div>
            {([
              { key: "worldDescription", id: "nc-world", label: "World description", max: 8000, hint: "Set the tone, place, time, and rules. A few sentences help the narrator follow your vision.", placeholder: "A rain-soaked city ruled by rival megacorps…" },
              { key: "userPersona", id: "nc-user", label: "Your persona", max: 4000, hint: "Who are you? Include your background, skills, motivations, or what matters to you.", placeholder: "I am a rogue netrunner with a debt to repay…" },
              { key: "aiPersona", id: "nc-ai", label: "Narrator’s role", max: 4000, hint: "Describe the narrator’s voice, duties, and boundaries. Short descriptions are welcome too.", placeholder: "You are the Game Master. Describe the city and its characters in a gritty noir voice…" },
            ] as const).map((field) => (
              <div key={field.key} className="grid min-w-0 gap-2">
                <Label htmlFor={field.id}>{field.label}</Label>
                <Textarea id={field.id} required rows={3} maxLength={field.max} value={form[field.key]} onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))} placeholder={field.placeholder} aria-describedby={`${field.id}-hint`} className="max-h-60 el-scroll" />
                <p id={`${field.id}-hint`} className="text-xs leading-relaxed text-muted-foreground">{field.hint} <span className="tabular-nums">{form[field.key].length.toLocaleString()} / {field.max.toLocaleString()} characters.</span></p>
              </div>
            ))}
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="nc-state">Starting state <span className="font-normal text-muted-foreground">(optional JSON)</span></Label>
              <Textarea id="nc-state" ref={stateRef} rows={4} maxLength={16000} value={stateText} spellCheck={false} placeholder={'{"location": "The gates", "inventory": []}'} className="max-h-60 font-mono el-scroll" onChange={(event) => { setStateText(event.target.value); setStateError(null); }} aria-invalid={Boolean(stateError)} aria-describedby={stateError ? "state-hint state-error" : "state-hint"} />
              <p id="state-hint" className="text-xs leading-relaxed text-muted-foreground">Leave blank for an empty lorebook. Or add a compact JSON object for location, inventory, and quests. Up to 16,000 characters; keep nesting within 6 levels and entries brief. Background updates may change these details.</p>
              {stateError && <p id="state-error" role="alert" className="text-sm text-destructive">{stateError}</p>}
            </div>
          </fieldset>
          {saveError && <p role="alert" className="mt-4 text-sm text-destructive">Could not create your world: {saveError} Your entries are kept. Review them and try again.</p>}
          <DialogFooter className="mt-6 gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving || !ready || !userId} className="gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flame className="h-4 w-4" />}{saving ? "Creating world…" : "Create world"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
