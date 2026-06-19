"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Send, KeyRound, Wand2, BookOpen, Brain, Flame } from "lucide-react";
import type { Campaign } from "@/types/echolore";

interface ChatWindowProps {
  campaign: Campaign | null;
  worldStateJson: string | null;
  onOpenSettings: () => void;
  onOpenNewCampaign: () => void;
}

export function ChatWindow({
  campaign, worldStateJson, onOpenSettings, onOpenNewCampaign,
}: ChatWindowProps) {
  // Scroll to top when campaign changes (placeholder behavior — real chat will auto-scroll to bottom)
  useEffect(() => { /* no-op */ }, [campaign?.id]);

  if (!campaign) {
    return <EmptyChat onOpenNewCampaign={onOpenNewCampaign} onOpenSettings={onOpenSettings} />;
  }

  return (
    <div className="relative flex h-full flex-col el-ember-bg">
      {/* Header — campaign identity + world state peek */}
      <header className="flex items-center justify-between gap-3 border-b border-border bg-card/60 px-4 py-3 backdrop-blur">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-primary" />
            <h2 className="truncate text-base font-semibold text-foreground">{campaign.title}</h2>
          </div>
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
            {campaign.worldDescription}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-border text-[10px] text-muted-foreground">
            <BookOpen className="mr-1 h-3 w-3" />
            {worldStateJson ? "Lorebook active" : "Lorebook empty"}
          </Badge>
        </div>
      </header>

      {/* Persona reminders (collapsible-feel strip) */}
      <div className="grid gap-2 border-b border-border bg-muted/20 px-4 py-2 md:grid-cols-2">
        <PersonaChip label="You are" text={campaign.userPersona} icon={<Sparkles className="h-3 w-3 text-primary" />} />
        <PersonaChip label="AI is" text={campaign.aiPersona} icon={<Brain className="h-3 w-3 text-primary" />} />
      </div>

      {/* Chat body — placeholder for now (RAG pipeline wired up next iteration) */}
      <ScrollArea className="flex-1 el-scroll">
        <div className="mx-auto max-w-3xl px-4 py-8">
          <div className="rounded-lg border border-dashed border-border bg-card/40 p-6 text-center">
            <Wand2 className="mx-auto h-8 w-8 text-primary/60" />
            <h3 className="mt-3 text-sm font-medium text-foreground">
              The fire is lit. Your story awaits.
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              The RAG memory pipeline will arrive in the next iteration. Once wired up,
              your message will flow through this exact pipeline:
            </p>

            <ol className="mx-auto mt-4 max-w-md space-y-1.5 text-left text-xs text-muted-foreground">
              {[
                "Save your message → messages table",
                "Generate embedding → embeddings table",
                "Vector search → top 5 past events",
                "Pull last 5 messages → working memory",
                "Compile mega-prompt (world + state + memories + chat)",
                "Stream AI reply via Vercel AI SDK",
                "Every 4th msg → background lorebook updater",
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[9px] font-semibold text-primary">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>

            <p className="mt-4 text-xs text-muted-foreground/80">
              For now, the world has been saved. Review the foundation before we wire up the engine.
            </p>
          </div>
        </div>
      </ScrollArea>

      {/* Composer — disabled until RAG pipeline is wired up */}
      <div className="border-t border-border bg-card/60 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <Textarea
            placeholder="The RAG pipeline arrives next — for now, review the foundation…"
            rows={1}
            disabled
            className="min-h-[44px] flex-1 resize-none bg-background/60 text-sm"
          />
          <Button disabled className="gap-2 bg-primary/60 text-primary-foreground">
            <Send className="h-4 w-4" /> Send
          </Button>
        </div>
        <div className="mx-auto mt-2 max-w-3xl text-center text-[10px] text-muted-foreground/60">
          Chat is intentionally disabled in this iteration · RAG pipeline coming next
        </div>
      </div>
    </div>
  );
}

function PersonaChip({ label, text, icon }: { label: string; text: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <div className="mt-0.5 flex items-center gap-1 shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
        {icon}
        {label}
      </div>
      <p className="line-clamp-1 text-xs text-muted-foreground" title={text}>
        {text}
      </p>
    </div>
  );
}

function EmptyChat({
  onOpenNewCampaign, onOpenSettings,
}: { onOpenNewCampaign: () => void; onOpenSettings: () => void }) {
  return (
    <div className="el-ember-bg relative flex h-full flex-col items-center justify-center px-6 py-12 text-center">
      <div className="max-w-lg">
        <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/30">
          <Flame className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Welcome to Echo<span className="text-primary">Lore</span>
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          A BYOK AI roleplay client with RAG memory. Build a world, define who you are,
          and let an AI Game Master remember every twist — powered by vectorized memories
          and a dynamic lorebook.
        </p>

        <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
          <Button
            onClick={onOpenNewCampaign}
            className="gap-2 bg-primary text-primary-foreground hover:bg-[var(--ember-strong)]"
          >
            <Wand2 className="h-4 w-4" /> Forge a new world
          </Button>
          <Button variant="outline" onClick={onOpenSettings} className="gap-2 border-border">
            <KeyRound className="h-4 w-4" /> Add your API keys
          </Button>
        </div>

        <div className="mt-8 grid gap-2 text-left sm:grid-cols-3">
          {[
            { icon: <Wand2 className="h-3.5 w-3.5 text-primary" />, t: "Define the world", d: "World, persona, AI role" },
            { icon: <Brain className="h-3.5 w-3.5 text-primary" />, t: "RAG memory", d: "Top-5 vector recall" },
            { icon: <BookOpen className="h-3.5 w-3.5 text-primary" />, t: "Living lorebook", d: "Auto-updating world state" },
          ].map((f) => (
            <div key={f.t} className="rounded-md border border-border bg-card/40 p-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                {f.icon}
                {f.t}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">{f.d}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
