"use client";

import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Plus, MoreHorizontal, Trash2, Settings, Flame, Loader2 } from "lucide-react";
import { BrandWordmark } from "./brand";
import { useCampaignStore } from "@/store/campaign-store";
import { useMockUser } from "@/hooks/use-mock-user";
import { useMounted } from "@/hooks/use-mounted";
import { useByokStore } from "@/store/byok-store";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import type { Campaign } from "@/types/echolore";

interface SidebarProps {
  onNewCampaign: () => void;
  onOpenSettings: () => void;
  onRetry: () => void;
  onSelect?: () => void;
}

export function Sidebar({ onNewCampaign, onOpenSettings, onRetry, onSelect }: SidebarProps) {
  const { userId, ready } = useMockUser();
  const { campaigns, activeId, remove, setActive, loading, error } = useCampaignStore();
  const hasKey = useByokStore((s) => Boolean(s.config.openrouterKey.trim()));
  const hydrated = useMounted();
  const [deleting, setDeleting] = useState<Campaign | null>(null);
  const [pending, setPending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function deleteWorld() {
    if (!userId || !deleting || pending) return;
    setPending(true);
    setDeleteError(null);
    try {
      await remove(userId, deleting.id);
      setDeleting(null);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Could not delete this world. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <aside className="el-sidebar flex h-full min-h-0 w-full flex-col bg-sidebar text-sidebar-foreground" aria-label="World navigation">
      <div className="border-b border-sidebar-border px-4 py-5">
        <BrandWordmark />
      </div>
      <div className="px-3 pt-4">
        <Button onClick={onNewCampaign} className="h-11 w-full justify-start gap-2" disabled={!ready || !userId}>
          <Plus className="h-4 w-4" /> New World
        </Button>
      </div>
      <h2 className="px-5 pb-2 pt-6 text-sm font-medium text-muted-foreground">Your worlds</h2>
      {loading && <p role="status" className="px-5 py-2 text-sm text-muted-foreground">Loading worlds…</p>}
      {error && (
        <div className="mx-3 mb-3 rounded-md border border-destructive/40 p-3 text-sm">
          <p role="alert">Could not refresh your worlds.</p>
          <p className="mt-1 text-xs text-muted-foreground break-words">{error}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={onRetry} disabled={loading || !ready || !userId}>Retry worlds</Button>
        </div>
      )}
      <ScrollArea className="min-h-0 flex-1 px-2 el-scroll">
        {!loading && !error && campaigns.length === 0 ? (
          <div className="px-3 py-6 text-sm text-muted-foreground">
            <p>No worlds yet.</p>
            <p className="mt-2 leading-relaxed">Create a world above. Start with a preset or make it your own.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-1 pb-4">
            {campaigns.map((c) => {
              const updated = new Date(c.updatedAt);
              return (
                <li key={c.id} className={cn("flex items-start rounded-md", activeId === c.id && "bg-sidebar-accent")}>
                  <button
                    onClick={() => { if (activeId !== c.id) setActive(c.id); onSelect?.(); }}
                    aria-current={activeId === c.id ? "page" : undefined}
                    className="min-w-0 flex-1 rounded-md px-3 py-3 text-left transition-colors hover:bg-sidebar-accent"
                  >
                    <span className="flex items-center gap-2">
                      <Flame className={cn("h-4 w-4 shrink-0", activeId === c.id ? "text-primary" : "text-muted-foreground")} />
                      <span className="truncate text-sm font-medium" title={c.title}>{c.title}</span>
                    </span>
                    <span className="mt-1 block line-clamp-2 text-xs leading-relaxed text-muted-foreground">{c.worldDescription}</span>
                    {!Number.isNaN(updated.getTime()) && <span className="mt-2 block text-xs text-muted-foreground">Updated {formatDistanceToNow(updated, { addSuffix: true })}</span>}
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="mt-1 h-11 w-11 shrink-0 text-muted-foreground" aria-label={`Actions for ${c.title}`}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => { setDeleteError(null); setDeleting(c); }} className="text-destructive focus:text-destructive">
                        <Trash2 className="mr-2 h-4 w-4" /> Delete world
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
      <div className="el-safe-bottom border-t border-sidebar-border p-3">
        <Button variant="ghost" className="h-11 w-full justify-start gap-2" onClick={onOpenSettings}>
          <Settings className="h-4 w-4" /> API settings
        </Button>
        <p className="mt-1 px-3 text-xs leading-relaxed text-muted-foreground">{hydrated && hasKey ? "Key saved on this browser · not verified" : "Bring an OpenRouter key to chat"}</p>
      </div>
      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open && !pending) setDeleting(null); }}>
        <AlertDialogContent className="el-dialog max-h-[calc(100dvh-2rem)] overflow-y-auto bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>This permanently deletes this world, its messages, and its lorebook. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && <p role="alert" className="text-sm text-destructive">{deleteError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Keep world</AlertDialogCancel>
            <AlertDialogAction disabled={pending || !userId} onClick={(e) => { e.preventDefault(); void deleteWorld(); }} className="bg-destructive text-white hover:bg-destructive/90">
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{pending ? "Deleting…" : "Delete world"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}
