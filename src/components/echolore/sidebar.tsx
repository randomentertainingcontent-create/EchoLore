"use client";

import { useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, MoreHorizontal, Sparkles, Trash2, Settings, Flame } from "lucide-react";
import { BrandWordmark } from "./brand";
import { useCampaignStore } from "@/store/campaign-store";
import { useMockUser } from "@/hooks/use-mock-user";
import { useMounted } from "@/hooks/use-mounted";
import { useByokStore } from "@/store/byok-store";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface SidebarProps {
  onNewCampaign: () => void;
  onOpenSettings: () => void;
}

export function Sidebar({ onNewCampaign, onOpenSettings }: SidebarProps) {
  const { userId, ready } = useMockUser();
  const { campaigns, activeId, fetchAll, remove, setActive, loading } = useCampaignStore();
  const hasKey = useByokStore((s) => s.hasKey());
  const hydrated = useMounted();

  useEffect(() => {
    if (ready && userId) fetchAll(userId);
  }, [ready, userId, fetchAll]);

  return (
    <aside className="flex h-full w-full flex-col bg-sidebar text-sidebar-foreground">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-sidebar-border">
        <BrandWordmark />
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "h-2 w-2 rounded-full el-pulse-dot",
              hydrated && hasKey ? "bg-primary" : "bg-muted-foreground/40",
            )}
            title={hasKey ? "OpenRouter key active" : "No OpenRouter key set"}
          />
        </div>
      </div>

      {/* New campaign button */}
      <div className="px-3 pt-3">
        <Button
          onClick={onNewCampaign}
          className="w-full justify-start gap-2 bg-primary text-primary-foreground hover:bg-[var(--ember-strong)]"
        >
          <Plus className="h-4 w-4" />
          New World
        </Button>
      </div>

      {/* Campaign list */}
      <div className="px-2 pt-4 pb-2">
        <div className="px-2 pb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Your worlds
        </div>
      </div>

      <ScrollArea className="flex-1 px-2 el-scroll">
        {loading ? (
          <div className="px-2 py-4 text-sm text-muted-foreground">Loading…</div>
        ) : campaigns.length === 0 ? (
          <EmptySidebar />
        ) : (
          <ul className="flex flex-col gap-1 pb-4">
            {campaigns.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => setActive(c.id)}
                  className={cn(
                    "group w-full rounded-md px-3 py-2 text-left transition-colors",
                    "hover:bg-sidebar-accent",
                    activeId === c.id && "bg-sidebar-accent",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <Flame
                          className={cn(
                            "h-3.5 w-3.5 shrink-0",
                            activeId === c.id ? "text-primary" : "text-muted-foreground",
                          )}
                        />
                        <span className="truncate text-sm font-medium text-sidebar-foreground">
                          {c.title}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {c.worldDescription}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground/80">
                        <span>
                          {(c as { _count?: { messages?: number } })._count?.messages ?? 0} msgs
                        </span>
                        <span>·</span>
                        <span>
                          {formatDistanceToNow(new Date(c.updatedAt), { addSuffix: true })}
                        </span>
                      </div>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => e.stopPropagation()}
                          className="opacity-0 transition-opacity group-hover:opacity-100 rounded p-1 hover:bg-sidebar-accent-foreground/10"
                          aria-label="Campaign menu"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </span>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DropdownMenuItem
                          onClick={() => {
                            if (userId && confirm(`Delete "${c.title}"? This cannot be undone.`)) {
                              remove(userId, c.id);
                            }
                          }}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-3">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
          onClick={onOpenSettings}
        >
          <Settings className="h-4 w-4" />
          API Keys {hasKey ? null : <Badge variant="outline" className="ml-1 text-[10px]">Required</Badge>}
        </Button>
        <div className="mt-2 px-3 text-[10px] text-muted-foreground/70">
          OpenRouter key · stored in browser only
        </div>
      </div>
    </aside>
  );
}

function EmptySidebar() {
  return (
    <div className="px-3 py-8 text-center">
      <Sparkles className="mx-auto h-8 w-8 text-muted-foreground/40" />
      <p className="mt-3 text-sm text-muted-foreground">
        No worlds yet.
      </p>
      <p className="mt-1 text-xs text-muted-foreground/70">
        Click <span className="text-primary">New World</span> to begin.
      </p>
    </div>
  );
}
