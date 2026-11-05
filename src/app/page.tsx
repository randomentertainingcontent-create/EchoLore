"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "@/components/echolore/sidebar";
import { ChatWindow } from "@/components/echolore/chat-window";
import { NewCampaignModal } from "@/components/echolore/new-campaign-modal";
import { SettingsModal, type SettingsTab } from "@/components/echolore/settings-modal";
import { EditWorldModal } from "@/components/echolore/edit-world-modal";
import type { WorldTemplate } from "@/components/echolore/presets";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetDescription, SheetTrigger } from "@/components/ui/sheet";
import { useCampaignStore } from "@/store/campaign-store";
import { useMounted } from "@/hooks/use-mounted";
import { PixelCampfire } from "@/components/echolore/pixel-art";

export default function Home() {
  const mounted = useMounted();
  if (!mounted) {
    return (
      <main className="el-app el-ember-bg flex min-h-dvh flex-col items-center justify-center gap-5 bg-background px-6 text-foreground">
        <PixelCampfire className="h-16 w-16" />
        <p role="status" className="text-sm text-muted-foreground">Lighting the fire…</p>
      </main>
    );
  }
  return <App />;
}

function App() {
  const { campaigns, activeId, activeWorldState, activeWorldStateUpdatedAt, lorePending, fetchAll, hydrateActive } = useCampaignStore();
  const [newOpen, setNewOpen] = useState(false);
  const [newTemplate, setNewTemplate] = useState<WorldTemplate | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("connection");
  const [worldsOpen, setWorldsOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  useEffect(() => { void fetchAll(); }, [fetchAll]);
  useEffect(() => { if (activeId) void hydrateActive(activeId); }, [activeId, hydrateActive]);

  const activeCampaign = useMemo(() => campaigns.find((c) => c.id === activeId) ?? null, [campaigns, activeId]);
  const editCampaign = useMemo(() => campaigns.find((c) => c.id === editId) ?? null, [campaigns, editId]);

  const openNew = (template: WorldTemplate | null = null) => { setWorldsOpen(false); setNewTemplate(template); setNewOpen(true); };
  const openSettings = (tab: SettingsTab = "connection") => { setWorldsOpen(false); setSettingsTab(tab); setSettingsOpen(true); };
  const retryWorlds = () => { void fetchAll(); };
  const refreshLore = useCallback(async () => { if (activeId) await hydrateActive(activeId); }, [activeId, hydrateActive]);

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
