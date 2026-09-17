"use client";

import { useEffect, useMemo, useState } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "@/components/echolore/sidebar";
import { ChatWindow } from "@/components/echolore/chat-window";
import { NewCampaignModal } from "@/components/echolore/new-campaign-modal";
import { SettingsModal } from "@/components/echolore/settings-modal";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetDescription, SheetTrigger } from "@/components/ui/sheet";
import { useCampaignStore } from "@/store/campaign-store";
import { useMockUser } from "@/hooks/use-mock-user";
import { AuthPanel, AccountControl } from "@/components/echolore/auth-panel";
import { BrandWordmark } from "@/components/echolore/brand";
import { useByokStore } from "@/store/byok-store";

export default function Home() {
  const { userId, ready, recovery, accountVersion } = useMockUser();
  const ownerId = useCampaignStore((s) => s.ownerId);
  const keyOwnerId = useByokStore((s) => s.ownerId);

  if (!ready) return <main className="el-app el-ember-bg flex min-h-dvh items-center justify-center bg-background px-6 text-foreground"><p role="status" className="text-sm text-muted-foreground">Checking your session…</p></main>;
  if (!userId || recovery) return (
    <main className="el-app el-ember-bg min-h-dvh bg-background px-6 py-8 text-foreground sm:px-10">
      <div className="mx-auto max-w-5xl">
        <BrandWordmark />
        <div className="grid items-start gap-10 py-12 sm:py-20 md:grid-cols-2 md:gap-16">
          <div>
            <h1 className="max-w-md text-3xl font-semibold tracking-tight sm:text-4xl">Welcome to Echo<span className="text-primary">Lore</span></h1>
            <p className="mt-4 max-w-prose text-base leading-8 text-muted-foreground">A world of your making. A narrator to explore it with. Shape the setting, choose your character, and decide what happens next.</p>
            <p className="mt-6 max-w-prose text-sm leading-7 text-muted-foreground">Bring your own OpenRouter key when you’re ready to chat. Your saved key is cleared from this browser when you sign out or switch accounts.</p>
          </div>
          <AuthPanel key={`${accountVersion}:${recovery}`} />
        </div>
      </div>
    </main>
  );
  if (ownerId !== userId || keyOwnerId !== userId) return <main className="el-app flex min-h-dvh items-center justify-center bg-background px-6 text-foreground"><p role="status">Preparing your account…</p></main>;
  return <PrivateHome key={`${userId}:${accountVersion}`} userId={userId} />;
}

function PrivateHome({ userId }: { userId: string }) {
  const ready = true;
  const { campaigns, activeId, activeWorldState, fetchAll, setActive, hydrateActive } = useCampaignStore();
  const [newOpen, setNewOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [worldsOpen, setWorldsOpen] = useState(false);

  useEffect(() => {
    if (ready && userId) void fetchAll(userId);
  }, [ready, userId, fetchAll]);

  useEffect(() => {
    if (ready && userId && activeId) void hydrateActive(userId, activeId);
  }, [ready, userId, activeId, hydrateActive]);

  useEffect(() => {
    if (!ready || !userId || !activeId) return;
    const handler = () => { void hydrateActive(userId, activeId); };
    window.addEventListener("echolore:refresh-lorebook", handler);
    return () => window.removeEventListener("echolore:refresh-lorebook", handler);
  }, [ready, userId, activeId, hydrateActive]);

  const activeCampaign = useMemo(
    () => campaigns.find((c) => c.id === activeId) ?? null,
    [campaigns, activeId],
  );

  const openNew = () => { setWorldsOpen(false); setNewOpen(true); };
  const openSettings = () => { setWorldsOpen(false); setSettingsOpen(true); };
  const retryWorlds = () => { if (ready && userId) void fetchAll(userId); };

  return (
    <div className="el-app flex h-dvh w-full overflow-hidden bg-background text-foreground">
      <div className="hidden h-full w-72 shrink-0 border-r border-border md:block">
        <Sidebar onNewCampaign={openNew} onOpenSettings={openSettings} onRetry={retryWorlds} />
      </div>
      <div className="flex h-full min-w-0 flex-1 flex-col">
        <AccountControl />
        <div className="el-mobile-bar flex shrink-0 items-center gap-3 border-b border-border bg-sidebar px-3 py-2 md:hidden">
          <Sheet open={worldsOpen} onOpenChange={setWorldsOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" className="h-11 gap-2" aria-label="Open world navigation">
                <Menu className="h-4 w-4" /> Worlds
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="el-world-sheet h-dvh w-[min(20rem,calc(100%-2rem))] gap-0 bg-sidebar p-0">
              <SheetTitle className="sr-only">Your worlds</SheetTitle>
              <SheetDescription className="sr-only">Choose a world, create a new one, or manage your API settings.</SheetDescription>
              <Sidebar onNewCampaign={openNew} onOpenSettings={openSettings} onRetry={retryWorlds} onSelect={() => setWorldsOpen(false)} />
            </SheetContent>
          </Sheet>
          <span className="min-w-0 truncate text-sm font-medium">{activeCampaign?.title ?? "EchoLore"}</span>
        </div>
        <main className="min-h-0 flex-1 overflow-hidden" id="story">
          <ChatWindow campaign={activeCampaign} worldStateJson={activeWorldState} onOpenSettings={openSettings} onOpenNewCampaign={openNew} />
        </main>
      </div>
      <NewCampaignModal open={newOpen} onOpenChange={setNewOpen} onCreated={(id) => setActive(id)} />
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
