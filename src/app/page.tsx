"use client";

import { useEffect, useMemo, useState } from "react";
import { Sidebar } from "@/components/echolore/sidebar";
import { ChatWindow } from "@/components/echolore/chat-window";
import { NewCampaignModal } from "@/components/echolore/new-campaign-modal";
import { SettingsModal } from "@/components/echolore/settings-modal";
import { useCampaignStore } from "@/store/campaign-store";
import { useMockUser } from "@/hooks/use-mock-user";
import { useByokStore } from "@/store/byok-store";
import { useMounted } from "@/hooks/use-mounted";

export default function Home() {
  const { userId, ready } = useMockUser();
  const { campaigns, activeId, activeWorldState, fetchAll, setActive, hydrateActive } = useCampaignStore();
  const hasKey = useByokStore((s) => Boolean(s.config.openrouterKey.trim()));
  const mounted = useMounted();

  const [newOpen, setNewOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Load campaigns when user is ready
  useEffect(() => {
    if (ready && userId) fetchAll(userId);
  }, [ready, userId, fetchAll]);

  // When the active campaign changes, hydrate its world_state
  useEffect(() => {
    if (ready && userId && activeId) hydrateActive(userId, activeId);
  }, [ready, userId, activeId, hydrateActive]);

  // Listen for lorebook refresh events (fired by ChatWindow after streaming
  // completes — the background lorebook updater may have modified world_state)
  useEffect(() => {
    if (!ready || !userId || !activeId) return;
    const handler = () => hydrateActive(userId, activeId);
    window.addEventListener("echolore:refresh-lorebook", handler);
    return () => window.removeEventListener("echolore:refresh-lorebook", handler);
  }, [ready, userId, activeId, hydrateActive]);

  // First-visit nudge: open Settings if no key set after hydration
  useEffect(() => {
    if (!mounted) return;
    if (hasKey) return;
    if (campaigns.length > 0) return;
    const seen = localStorage.getItem("echolore:settings-seen");
    if (seen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettingsOpen(true);
    localStorage.setItem("echolore:settings-seen", "1");
  }, [mounted, hasKey, campaigns.length]);

  const activeCampaign = useMemo(
    () => campaigns.find((c) => c.id === activeId) ?? null,
    [campaigns, activeId],
  );

  const worldStateJson = activeWorldState;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      {/* Sidebar — fixed width on md+, hidden on small screens (could add a drawer later) */}
      <div className="hidden h-full w-72 shrink-0 border-r border-border md:block">
        <Sidebar
          onNewCampaign={() => setNewOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      </div>

      {/* Main column */}
      <div className="flex h-full min-w-0 flex-1 flex-col">
        {/* Mobile top bar (sidebar replacement) */}
        <div className="flex items-center justify-between border-b border-border bg-sidebar px-3 py-2 md:hidden">
          <button
            onClick={() => setNewOpen(true)}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
          >
            + New World
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="rounded-md px-2 py-1.5 text-xs text-muted-foreground"
          >
            Settings
          </button>
        </div>

        <main className="flex-1 overflow-hidden">
          <ChatWindow
            campaign={activeCampaign}
            worldStateJson={worldStateJson}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenNewCampaign={() => setNewOpen(true)}
          />
        </main>
      </div>

      <NewCampaignModal
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={(id) => setActive(id)}
      />
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
