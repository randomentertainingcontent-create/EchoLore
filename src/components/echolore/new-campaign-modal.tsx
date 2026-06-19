"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, Dices, Wand2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCampaignStore } from "@/store/campaign-store";
import { useMockUser } from "@/hooks/use-mock-user";
import type { NewCampaignInput } from "@/types/echolore";

interface NewCampaignModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (campaignId: string) => void;
}

interface Preset {
  label: string;
  title: string;
  worldDescription: string;
  userPersona: string;
  aiPersona: string;
  startingState: Record<string, unknown>;
}

const PRESETS: Preset[] = [
  {
    label: "Cyberpunk Neon",
    title: "Chrome & Ash",
    worldDescription:
      "A cyberpunk megacity ruled by warring megacorps. The rain never stops, " +
      "the neon never sleeps, and the net is more real than the street. " +
      "Augmented mercenaries, black ice, and digital ghosts drift between chrome towers " +
      "while the undercity rots in acid rain.",
    userPersona:
      "I am a rogue netrunner with a chrome left arm and a stolen military AI in my head. " +
      "I owe the Triad a lot of money and I trust almost no one.",
    aiPersona:
      "You are the Game Master. Describe the environment cinematically, control all NPCs " +
      "(fixers, corpos, gangers, AIs), and present me with hard choices. Stay gritty and noir.",
    startingState: {
      location: "Night Market, Sector 7",
      inventory: ["cyberdeck", "kyber pistol", "fake ID", "0.4 BTC"],
      health: 100,
      reputation: "Unknown",
      active_quests: ["Pay off the Triad debt (50,000€$)"],
    },
  },
  {
    label: "Dragon Realm",
    title: "The Ironwood Vale",
    worldDescription:
      "A medieval fantasy world of dragons, fading kingdoms, and old magic. " +
      "The Ironwood Vale is a forested valley on the frontier, bordered by " +
      "the Smoking Mountains where the last dragons sleep.",
    userPersona:
      "I am a humble farmer's child who found a rusted sword in the riverbank. " +
      "Strange dreams have started, and last night the sword glowed in the dark.",
    aiPersona:
      "You are the Storyteller. Paint the world with sensory detail, voice every NPC " +
      "distinctly, and let my choices ripple through the world. Use the world_state " +
      "to track inventory, location, health, and quests.",
    startingState: {
      location: "Ironwood Vale — family farmstead",
      inventory: ["rusted sword", "loaf of bread", "farming clothes"],
      health: 90,
      gold: 3,
      active_quests: ["Discover the origin of the rusted sword"],
    },
  },
  {
    label: "Deep Space",
    title: "Salvage Rig Sigma-9",
    worldDescription:
      "The year is 2387. Humanity has spread to a dozen systems. You work a " +
      "deep-space salvage rig near the abandoned Sigma-9 mining station, where " +
      "something went silent 40 years ago. Salvage pays well. Curiosity pays more.",
    userPersona:
      "I am the rig's lead salvager — ex-military, scarred, practical. I carry " +
      "a pulse rifle and a toolkit. The crew trusts me to make the call when " +
      "things go wrong.",
    aiPersona:
      "You are the Game Master. Build dread slowly. Describe the station in " +
      "sensory detail (smell, sound, gravity). Control the crew NPCs and whatever " +
      "is lurking on Sigma-9. Track oxygen, ammo, and sanity in world_state.",
    startingState: {
      location: "Docking airlock, Sigma-9",
      inventory: ["pulse rifle", "salvage toolkit", "headlamp", "O2 tank (full)"],
      health: 100,
      oxygen: 100,
      sanity: 100,
      active_quests: ["Find out what silenced Sigma-9"],
    },
  },
  {
    label: "Cozy Mystery",
    title: "Pinewood Hollow",
    worldDescription:
      "A small coastal town where everyone knows everyone. The lighthouse " +
      "keeper just turned up dead and the local sheriff is out of his depth. " +
      "It's autumn, the leaves are turning, and someone in town is lying.",
    userPersona:
      "I am a retired big-city homicide detective who moved to Pinewood Hollow " +
      "for a quiet life. I run the bookshop on Main Street. I notice things.",
    aiPersona:
      "You are the Storyteller. Cozy mystery tone — atmospheric, character-driven, " +
      "no on-screen gore. Voice every townsperson distinctly. Drop clues fair " +
      "and square. Track suspects, clues, and the day/time in world_state.",
    startingState: {
      location: "Pinewood Hollow — Main Street Books",
      day: 1,
      time: "8:14 AM",
      inventory: ["notebook", "reading glasses", "mug of coffee"],
      suspects: ["the sheriff", "the lighthouse keeper's niece", "the harbor master"],
      clues: [],
      active_quests: ["Solve the lighthouse keeper's murder"],
    },
  },
];

/** Count words in a string (whitespace-separated). */
function wordCount(s: string): number {
  const t = s.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

/** Returns "thin" if the field has too few words to give the AI useful context. */
function fieldThickness(words: number, min: number): "empty" | "thin" | "ok" {
  if (words === 0) return "empty";
  if (words < min) return "thin";
  return "ok";
}

export function NewCampaignModal({ open, onOpenChange, onCreated }: NewCampaignModalProps) {
  const { userId } = useMockUser();
  const create = useCampaignStore((s) => s.create);
  const { toast } = useToast();

  const [form, setForm] = useState<NewCampaignInput>({
    title: "",
    worldDescription: "",
    userPersona: "",
    aiPersona: "",
    startingState: {},
  });
  const [stateText, setStateText] = useState<string>("{\n  \"location\": \"\",\n  \"inventory\": [],\n  \"health\": 100\n}");
  const [stateError, setStateError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function applyPreset(p: Preset) {
    setForm({
      title: p.title,
      worldDescription: p.worldDescription,
      userPersona: p.userPersona,
      aiPersona: p.aiPersona,
      startingState: p.startingState,
    });
    setStateText(JSON.stringify(p.startingState, null, 2));
    setStateError(null);
  }

  function update<K extends keyof NewCampaignInput>(key: K, value: NewCampaignInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function validateState(text: string): Record<string, unknown> | null {
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        setStateError("Starting state must be a JSON object, e.g. { \"location\": \"...\" }");
        return null;
      }
      setStateError(null);
      return parsed as Record<string, unknown>;
    } catch (e) {
      setStateError(`Invalid JSON: ${(e as Error).message}`);
      return null;
    }
  }

  async function handleSubmit() {
    if (!userId) {
      toast({ title: "Not ready", description: "User identity not loaded yet.", variant: "destructive" });
      return;
    }
    if (!form.title.trim() || !form.worldDescription.trim() || !form.userPersona.trim() || !form.aiPersona.trim()) {
      toast({ title: "Missing fields", description: "Title, World Description, User Persona, and AI Persona are all required.", variant: "destructive" });
      return;
    }

    // Thin-prompt warning (non-blocking — user can still proceed)
    const worldWords = wordCount(form.worldDescription);
    const userWords = wordCount(form.userPersona);
    const aiWords = wordCount(form.aiPersona);
    if (worldWords < 15 || userWords < 10 || aiWords < 10) {
      const proceed = confirm(
        "Your world/persona descriptions are quite short. The AI may improvise a setting " +
        "that doesn't match what you imagined.\n\n" +
        `World: ${worldWords} words (recommend 15+)\n` +
        `User persona: ${userWords} words (recommend 10+)\n` +
        `AI persona: ${aiWords} words (recommend 10+)\n\n` +
        "Continue anyway?",
      );
      if (!proceed) return;
    }

    const parsedState = validateState(stateText);
    if (parsedState === null) {
      toast({ title: "Starting state JSON is invalid", description: stateError ?? "Fix the JSON and try again.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const campaign = await create(userId, { ...form, startingState: parsedState });
      toast({
        title: "World created",
        description: `“${campaign.title}” is ready. The fire is lit.`,
      });
      onOpenChange(false);
      onCreated?.(campaign.id);
      // Reset form for next time
      setForm({ title: "", worldDescription: "", userPersona: "", aiPersona: "", startingState: {} });
      setStateText("{\n  \"location\": \"\",\n  \"inventory\": [],\n  \"health\": 100\n}");
    } catch (e) {
      toast({ title: "Failed to create world", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto el-scroll bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Wand2 className="h-5 w-5 text-primary" />
            Forge a New World
          </DialogTitle>
          <DialogDescription>
            Define the universe, who you are, and what the AI should be. This is the foundation
            the AI will use to stay in character and remember everything.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="blank" className="mt-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Quick start
            </Label>
            <TabsList className="bg-muted/40">
              <TabsTrigger value="blank" className="gap-1.5">
                <Sparkles className="h-3.5 w-3.5" /> Blank
              </TabsTrigger>
              <TabsTrigger value="preset" className="gap-1.5">
                <Dices className="h-3.5 w-3.5" /> Presets
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="preset" className="mt-3">
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <Button
                  key={p.label}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyPreset(p)}
                  className="border-border hover:border-primary hover:text-primary"
                >
                  {p.label}
                </Button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Click a preset to auto-fill the form below. Edit freely afterward.
            </p>
          </TabsContent>

          <TabsContent value="blank" className="mt-3">
            <p className="text-xs text-muted-foreground">
              Start from scratch — your imagination is the only limit.
            </p>
          </TabsContent>
        </Tabs>

        <div className="mt-4 grid gap-5">
          {/* Title */}
          <div className="grid gap-2">
            <Label htmlFor="nc-title">
              Campaign Title <span className="text-primary">*</span>
            </Label>
            <Input
              id="nc-title"
              placeholder="e.g. Chrome & Ash"
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              maxLength={80}
            />
          </div>

          {/* World description */}
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="nc-world">
                World Description <span className="text-primary">*</span>
              </Label>
              <FieldCounter words={wordCount(form.worldDescription)} min={15} />
            </div>
            <Textarea
              id="nc-world"
              rows={4}
              placeholder="A cyberpunk city ruled by megacorps where the rain never stops…  /  A modern high school in a quiet suburb…  /  A starship on a 200-year voyage…"
              value={form.worldDescription}
              onChange={(e) => update("worldDescription", e.target.value)}
            />
            <FieldHint
              words={wordCount(form.worldDescription)}
              min={15}
              ok="Define the universe — tone, setting, time period, key factions, rules of magic or tech."
              thin="Too thin — the AI will have to guess the setting. Add a sentence or two about WHERE and WHEN this takes place."
            />
          </div>

          {/* Personas — two columns on md+ */}
          <div className="grid gap-5 md:grid-cols-2">
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="nc-user">
                  Your Persona <span className="text-primary">*</span>
                </Label>
                <FieldCounter words={wordCount(form.userPersona)} min={10} />
              </div>
              <Textarea
                id="nc-user"
                rows={4}
                placeholder="I'm a 16-year-old high school student who loves sci-fi and is shy around new people…  /  I am a rogue hacker with a cybernetic arm…  /  I am a humble farmer who found a magic sword…"
                value={form.userPersona}
                onChange={(e) => update("userPersona", e.target.value)}
              />
              <FieldHint
                words={wordCount(form.userPersona)}
                min={10}
                ok="Who are you? Background, age, skills, personality, motivations."
                thin="Too thin — give the AI something to work with. Age, personality, what you look like, what you care about."
              />
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="nc-ai">
                  AI Persona / Role <span className="text-primary">*</span>
                </Label>
                <FieldCounter words={wordCount(form.aiPersona)} min={10} />
              </div>
              <Textarea
                id="nc-ai"
                rows={4}
                placeholder="You are my best friend, casual and joking, we hang out after school…  /  You are the Game Master. Describe the environment and control all NPCs…"
                value={form.aiPersona}
                onChange={(e) => update("aiPersona", e.target.value)}
              />
              <FieldHint
                words={wordCount(form.aiPersona)}
                min={10}
                ok="What should the AI do? Tone, narrative duties, NPC behavior."
                thin="Too thin — describe HOW the AI should act. Friendly? Mysterious? Hostile? What's their voice?"
              />
            </div>
          </div>

          {/* Starting state (optional JSON) */}
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="nc-state">
                Starting State <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Badge variant="outline" className="text-[10px]">JSON</Badge>
            </div>
            <Textarea
              id="nc-state"
              rows={7}
              spellCheck={false}
              className="font-mono text-xs"
              value={stateText}
              onChange={(e) => {
                setStateText(e.target.value);
                validateState(e.target.value);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Initial JSON for inventory, location, health, etc. The AI will see this in every prompt,
              and the background lorebook will keep it updated as the story unfolds.
            </p>
            {stateError && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{stateError}</span>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="mt-4 gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving}
            className="gap-2 bg-primary text-primary-foreground hover:bg-[var(--ember-strong)]"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flame className="h-4 w-4" />}
            {saving ? "Forging…" : "Light the fire"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Local Flame icon — lucide doesn't ship "Flame" as a 16px-stroke icon consistently,
// so we reuse a small inline one for the submit button.
function Flame({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 2 C 13.5 5, 17 7, 17 12 C 17 15.5, 14.8 18, 12 18 C 9.2 18, 7 15.5, 7 12 C 7 9.5, 9 8, 10 6 C 10.5 4.5, 11 3, 12 2 Z" />
      <ellipse cx="12" cy="14" rx="2.2" ry="3" opacity="0.4" fill="oklch(0.16 0.012 250)" />
    </svg>
  );
}

/** Live word counter badge — green when OK, amber when thin, muted when empty. */
function FieldCounter({ words, min }: { words: number; min: number }) {
  const t = fieldThickness(words, min);
  return (
    <span
      className={
        "text-[10px] font-mono " +
        (t === "ok"
          ? "text-primary"
          : t === "thin"
            ? "text-amber-500 dark:text-amber-400"
            : "text-muted-foreground/50")
      }
      title={t === "thin" ? `Need at least ${min} words for the AI to have good context` : undefined}
    >
      {words} / {min}+ words
    </span>
  );
}

/** Helper text below a field — shows the "thin" warning in amber when too short. */
function FieldHint({
  words, min, ok, thin,
}: { words: number; min: number; ok: string; thin: string }) {
  const t = fieldThickness(words, min);
  return (
    <p
      className={
        "text-xs " +
        (t === "thin" ? "text-amber-500 dark:text-amber-400" : "text-muted-foreground")
      }
    >
      {t === "thin" ? thin : ok}
    </p>
  );
}
