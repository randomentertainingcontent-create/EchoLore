"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Brain, KeyRound, Map as MapIcon, Menu } from "lucide-react";
import { Sidebar } from "@/components/echolore/sidebar";
import { ChatWindow } from "@/components/echolore/chat-window";
import { NewCampaignModal } from "@/components/echolore/new-campaign-modal";
import { SettingsModal, type SettingsTab } from "@/components/echolore/settings-modal";
import { EditWorldModal } from "@/components/echolore/edit-world-modal";
import type { WorldTemplate } from "@/components/echolore/presets";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetDescription, SheetTrigger } from "@/components/ui/sheet";
import { useCampaignStore } from "@/store/campaign-store";
import { useMockUser } from "@/hooks/use-mock-user";
import { AuthPanel } from "@/components/echolore/auth-panel";
import { BrandWordmark } from "@/components/echolore/brand";
import { useByokStore } from "@/store/byok-store";

const HIGHLIGHTS = [
  { icon: MapIcon, title: "Any world, any role", text: "Cyberpunk heists, small-town mysteries, slow-burn romance, or a night of cramming with your best friend." },
  { icon: Brain, title: "A narrator that remembers", text: "Every moment is stored as searchable memory, so old promises and grudges resurface naturally." },
  { icon: BookOpen, title: "A lorebook that keeps up", text: "Location, inventory, goals and relationships are tracked for you, and you can edit them anytime." },
  { icon: KeyRound, title: "Your key, your models", text: "Use free or premium OpenRouter models. Your key never touches our database." },
];

export default function Home() {
  const { userId, ready, recovery, accountVersion } = useMockUser();
  const ownerId = useCampaignStore((s) => s.ownerId);
  const keyOwnerId = useByokStore((s) => s.ownerId);

  if (!ready) return <main className="el-app el-ember-bg flex min-h-dvh items-center justify-center bg-background px-6 text-foreground"><p role="status" className="text-sm text-muted-foreground">Checking your session…</p></main>;
  if (!userId || recovery) return (
    <main className="el-app el-ember-bg min-h-dvh bg-background px-5 py-8 text-foreground sm:px-10">
      <div className="mx-auto max-w-5xl">
        <BrandWordmark />
        <div className="grid items-start gap-10 py-10 sm:py-16 md:grid-cols-[1.1fr_1fr] md:gap-16">
          <div>
            <h1 className="el-display max-w-md text-4xl sm:text-5xl">Stories that <span className="text-primary">remember</span>.</h1>
            <p className="mt-5 max-w-prose text-base leading-8 text-muted-foreground">Build a world, pick who you are, and play it out with a narrator that keeps track of where you are, what you carry, who you’ve met and what you promised.</p>
            <ul className="mt-8 grid gap-5 sm:grid-cols-2">
              {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex gap-3">
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <span><span className="block text-sm font-medium">{title}</span><span className="mt-1 block text-sm leading-relaxed text-muted-foreground">{text}</span></span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-md border border-border bg-card p-6 sm:p-8">
            <AuthPanel key={`${accountVersion}:${recovery}`} />
          </div>
        </div>
      </div>
    </main>
  );
  if (ownerId !== userId || keyOwnerId !== userId) return <main className="el-app flex min-h-dvh items-center justify-center bg-background px-6 text-foreground"><p role="status">Preparing your account…</p></main>;
  return <PrivateHome key={`${userId}:${accountVersion}`} userId={userId} />;
}

function PrivateHome({ userId }: { userId: string }) {
  const { campaigns, activeId, activeWorldState, activeWorldStateUpdatedAt, lorePending, fetchAll, hydrateActive } = useCampaignStore();
  const [newOpen, setNewOpen] = useState(false);
  const [newTemplate, setNewTemplate] = useState<WorldTemplate | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("connection");
  const [worldsOpen, setWorldsOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  useEffect(() => { void fetchAll(userId); }, [userId, fetchAll]);
  useEffect(() => { if (activeId) void hydrateActive(userId, activeId); }, [userId, activeId, hydrateActive]);

  const activeCampaign = useMemo(() => campaigns.find((c) => c.id === activeId) ?? null, [campaigns, activeId]);
  const editCampaign = useMemo(() => campaigns.find((c) => c.id === editId) ?? null, [campaigns, editId]);

  const openNew = (template: WorldTemplate | null = null) => { setWorldsOpen(false); setNewTemplate(template); setNewOpen(true); };
  const openSettings = (tab: SettingsTab = "connection") => { setWorldsOpen(false); setSettingsTab(tab); setSettingsOpen(true); };
  const retryWorlds = () => { void fetchAll(userId); };
  const refreshLore = useCallback(async () => { if (activeId) await hydrateActive(userId, activeId); }, [userId, activeId, hydrateActive]);

  const sidebarProps = {
    onNewCampaign: () => openNew(null),
    onOpenSettings: () => openSettings("connection"),
    onRetry: retryWorlds,
    onEditWorld: (id: string) => { setWorldsOpen(false); setEditId(id); },
  };

  const mobileNav = (
    <Sheet open={worldsOpen} onOpenChange={setWorldsOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" aria-label="Open world navigation">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="el-world-sheet h-dvh w-[min(20rem,calc(100%-2rem))] gap-0 bg-sidebar p-0">
        <SheetTitle className="sr-only">Your worlds</SheetTitle>
        <SheetDescription className="sr-only">Choose a world, create a new one, or manage your settings.</SheetDescription>
        <Sidebar {...sidebarProps} onSelect={() => setWorldsOpen(false)} />
      </SheetContent>
    </Sheet>
  );

  return (
    <div className="el-app flex h-dvh w-full overflow-hidden bg-background text-foreground">
      <div className="hidden h-full w-72 shrink-0 border-r border-border md:block">
        <Sidebar {...sidebarProps} />
      </div>
      <main className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden" id="story">
        <ChatWindow
          campaign={activeCampaign}
          worldStateJson={activeWorldState}
          worldStateUpdatedAt={activeWorldStateUpdatedAt}
          lorePending={lorePending}
          mobileNav={mobileNav}
          onOpenSettings={openSettings}
          onOpenNewCampaign={openNew}
          onEditWorld={() => activeCampaign && setEditId(activeCampaign.id)}
          onRefreshLore={refreshLore}
        />
      </main>
      <NewCampaignModal key={newTemplate?.id ?? "blank"} open={newOpen} onOpenChange={setNewOpen} initialTemplate={newTemplate} />
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} initialTab={settingsTab} />
      <EditWorldModal campaign={editCampaign} open={Boolean(editId)} onOpenChange={(open) => { if (!open) setEditId(null); }} />
    </div>
  );
}
