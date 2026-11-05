"use client";

import { useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Plus, MoreHorizontal, Trash2, Settings, Flame, Loader2, Search, Pencil, Copy, LogOut, KeyRound } from "lucide-react";
import { BrandWordmark } from "./brand";
import { useCampaignStore } from "@/store/campaign-store";
import { signOutAccount, useMockUser } from "@/hooks/use-mock-user";
import { useMounted } from "@/hooks/use-mounted";
import { useByokStore } from "@/store/byok-store";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import type { Campaign } from "@/types/echolore";

interface SidebarProps {
  onNewCampaign: () => void;
  onOpenSettings: () => void;
  onRetry: () => void;
  onEditWorld: (id: string) => void;
  onSelect?: () => void;
}

export function Sidebar({ onNewCampaign, onOpenSettings, onRetry, onEditWorld, onSelect }: SidebarProps) {
  const { userId, ready, email, error: sessionError } = useMockUser();
  const { campaigns, activeId, remove, setActive, duplicate, loading, error } = useCampaignStore();
  const hasKey = useByokStore((s) => Boolean(s.config.openrouterKey.trim()));
  const hydrated = useMounted();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [deleting, setDeleting] = useState<Campaign | null>(null);
  const [pending, setPending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return campaigns;
    return campaigns.filter((c) => c.title.toLowerCase().includes(q) || c.worldDescription.toLowerCase().includes(q));
  }, [campaigns, query]);

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

  async function copyWorld(campaign: Campaign) {
    if (!userId) return;
    try {
      const copy = await duplicate(userId, campaign.id);
      toast({ title: "World duplicated", description: `“${copy.title}” starts fresh with the same setup and lorebook.` });
      onSelect?.();
    } catch (e) {
      toast({ title: "Could not duplicate", description: e instanceof Error ? e.message : "Please try again.", variant: "destructive" });
    }
  }

  return (
    <aside className="el-sidebar flex h-full min-h-0 w-full flex-col bg-sidebar text-sidebar-foreground" aria-label="World navigation">
      <div className="border-b border-sidebar-border px-4 py-4">
        <BrandWordmark />
      </div>
      <div className="grid gap-2 px-3 pt-3">
        <Button onClick={onNewCampaign} className="h-11 w-full justify-start gap-2" disabled={!ready || !userId}>
          <Plus className="h-4 w-4" /> New World
        </Button>
        {campaigns.length > 3 && (
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search worlds" aria-label="Search worlds" className="h-10 pl-9 text-base sm:text-sm" />
          </div>
        )}
      </div>
      <h2 className="px-5 pb-2 pt-5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Your worlds</h2>
      {loading && campaigns.length === 0 && <p role="status" className="px-5 py-2 text-sm text-muted-foreground">Loading worlds…</p>}
      {error && (
        <div className="mx-3 mb-3 rounded-md border border-destructive/40 p-3 text-sm">
          <p role="alert">Could not refresh your worlds.</p>
          <p className="mt-1 break-words text-xs text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={onRetry} disabled={loading || !ready || !userId}>Retry worlds</Button>
        </div>
      )}
      <ScrollArea className="min-h-0 flex-1 px-2 el-scroll">
        {!loading && !error && campaigns.length === 0 ? (
          <div className="px-3 py-4 text-sm text-muted-foreground">
            <p>No worlds yet.</p>
            <p className="mt-2 leading-relaxed">Create one above from a template or a blank page.</p>
          </div>
        ) : filtered.length === 0 && query ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">No worlds match “{query}”.</p>
        ) : (
          <ul className="flex flex-col gap-0.5 pb-4">
            {filtered.map((c) => {
              const updated = new Date(c.updatedAt);
              const active = activeId === c.id;
              return (
                <li key={c.id} className={cn("group flex items-start rounded-lg", active && "bg-sidebar-accent")}>
                  <button
                    onClick={() => {
                      if (!active) {
                        const go = () => flushSync(() => setActive(c.id));
                        const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
                        if (doc.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) doc.startViewTransition(go);
                        else go();
                      }
                      onSelect?.();
                    }}
                    aria-current={active ? "page" : undefined}
                    className="min-w-0 flex-1 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-sidebar-accent"
                  >
                    <span className="flex items-center gap-2">
                      <Flame className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
                      <span className="truncate text-sm font-medium" title={c.title}>{c.title}</span>
                    </span>
                    <span className="mt-1 line-clamp-1 pl-6 text-xs leading-relaxed text-muted-foreground">{c.worldDescription}</span>
                    {!Number.isNaN(updated.getTime()) && <span className="mt-0.5 block pl-6 text-[11px] text-muted-foreground/80">{formatDistanceToNow(updated, { addSuffix: true })}</span>}
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="mt-1 h-10 w-10 shrink-0 text-muted-foreground" aria-label={`Actions for ${c.title}`}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => onEditWorld(c.id)}><Pencil className="mr-2 h-4 w-4" /> Edit world</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => void copyWorld(c)}><Copy className="mr-2 h-4 w-4" /> Duplicate</DropdownMenuItem>
                      <DropdownMenuSeparator />
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
      <div className="el-safe-bottom grid gap-1 border-t border-sidebar-border p-3">
        <Button variant="ghost" className="h-11 w-full justify-start gap-2" onClick={onOpenSettings}>
          {hydrated && hasKey ? <Settings className="h-4 w-4" /> : <KeyRound className="h-4 w-4 text-primary" />}
          <span className="min-w-0 flex-1 truncate text-left">{hydrated && hasKey ? "Settings" : "Settings · add your key"}</span>
          <span className={cn("h-2 w-2 rounded-full", hydrated && hasKey ? "bg-emerald-400" : "bg-primary el-pulse-dot")} aria-hidden="true" />
        </Button>
        <div className="flex min-w-0 items-center gap-2 rounded-md px-3">
          <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold uppercase">{(email ?? "?").charAt(0)}</span>
          <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={email ?? userId ?? undefined}>{email ?? "Signed in"}</p>
          <Button variant="ghost" size="sm" className="h-9 shrink-0 gap-1.5 px-2 text-xs" disabled={!ready} onClick={() => void signOutAccount()}><LogOut className="h-3.5 w-3.5" /> Sign out</Button>
        </div>
        {sessionError && <p role="alert" className="break-words px-3 text-xs text-destructive">{sessionError}</p>}
      </div>
      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open && !pending) setDeleting(null); }}>
        <AlertDialogContent className="el-dialog max-h-[calc(100dvh-2rem)] overflow-y-auto bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>This permanently deletes this world, its story, and its lorebook. This cannot be undone. Tip: export the story first from the ⋮ menu in the chat.</AlertDialogDescription>
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
