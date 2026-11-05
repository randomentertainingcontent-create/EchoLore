"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { AlertCircle, ArrowDown, BookOpen, Cpu, Download, FastForward, Flame, KeyRound, Loader2, MessageSquareQuote, MoreVertical, Pencil, RotateCcw, Send, Shuffle, SlidersHorizontal, Square, Wand2, Footprints, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { Campaign, Message } from "@/types/echolore";
import { useMockUser } from "@/hooks/use-mock-user";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useToast } from "@/hooks/use-toast";
import { useByokStore } from "@/store/byok-store";
import { usePrefsStore } from "@/store/prefs-store";
import { useCampaignStore } from "@/store/campaign-store";
import { buildAuthHeaders, buildByokHeaders, HDR_OPENROUTER_KEY } from "@/lib/byok/headers";
import { cn } from "@/lib/utils";
import { drafts } from "@/lib/drafts";
import { MessageItem, parseDirection } from "./message-item";
import { LorebookPanel } from "./lorebook-panel";
import { WORLD_TEMPLATES, type WorldTemplate } from "./presets";
import { PixelCampfire, Sigil } from "./pixel-art";
import type { SettingsTab } from "./settings-modal";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPENING = "[Direction: Set the opening scene. Show me where I am and what I notice, introduce someone or something that matters, and give me a reason to act.]";
const CONTINUE = "[Direction: Continue the scene naturally from where it left off.]";
const TWIST = "[Direction: Introduce an unexpected but fitting twist.]";

type Mode = "do" | "say" | "direct";
const MODES: { value: Mode; label: string; icon: typeof Footprints; placeholder: string }[] = [
  { value: "do", label: "Do", icon: Footprints, placeholder: "What do you do?" },
  { value: "say", label: "Say", icon: MessageSquareQuote, placeholder: "What do you say?" },
  { value: "direct", label: "Direct", icon: Compass, placeholder: "Steer the story, e.g. “skip to nightfall”" },
];

function formatMove(mode: Mode, text: string) {
  if (mode === "say") return /^["“]/.test(text) ? text : `"${text}"`;
  if (mode === "direct") return parseDirection(text) !== null ? text : `[Direction: ${text}]`;
  return text;
}

function toUI(messages: Message[]): UIMessage[] {
  return messages.map((m) => ({ id: m.id, role: m.role, parts: [{ type: "text", text: m.content }] }));
}

function textOf(message: UIMessage) {
  return message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");
}

function friendlyError(error: Error | undefined | null): string | null {
  if (!error) return null;
  const raw = error.message ?? "";
  try {
    const parsed = JSON.parse(raw) as { error?: unknown };
    if (typeof parsed.error === "string") {
      if (parsed.error === "Invalid provider settings") return "Your API settings look invalid. Check the key and model names.";
      if (parsed.error === "Unauthorized") return "Your session expired. Sign in again.";
      return parsed.error.endsWith(".") ? parsed.error : `${parsed.error}.`;
    }
  } catch {}
  if (/failed to fetch|network/i.test(raw)) return "Couldn’t reach EchoLore. Check your connection.";
  return raw && raw.length < 300 ? raw : "The reply could not finish.";
}

function sleep(ms: number, signal?: AbortSignal | null) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
  });
}

async function fetchHistory(campaignId: string, signal?: AbortSignal): Promise<Message[]> {
  const response = await fetch(`/api/messages/${campaignId}`, { headers: await buildAuthHeaders(), signal });
  if (!response.ok) throw new Error("Your story could not be loaded. Check your connection or sign in again, then retry.");
  const data = await response.json();
  return data.messages as Message[];
}

function download(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface ChatWindowProps {
  campaign: Campaign | null;
  worldStateJson: string | null;
  worldStateUpdatedAt: string | null;
  lorePending: boolean;
  mobileNav?: ReactNode;
  onOpenSettings: (tab?: SettingsTab) => void;
  onOpenNewCampaign: (template?: WorldTemplate | null) => void;
  onEditWorld: () => void;
  onRefreshLore: () => Promise<void>;
}

function TopBar({ mobileNav, children }: { mobileNav?: ReactNode; children?: ReactNode }) {
  if (!mobileNav && !children) return null;
  return (
    <header className="el-topbar flex shrink-0 items-center gap-2 border-b border-border bg-card px-3 py-2 md:hidden">
      {mobileNav}
      {children}
    </header>
  );
}

export function ChatWindow(props: ChatWindowProps) {
  const { campaign, mobileNav, onOpenNewCampaign, onOpenSettings } = props;
  const { userId } = useMockUser();
  const hasKey = useByokStore((s) => Boolean(s.config.openrouterKey.trim()));

  if (!campaign || !userId) {
    return (
      <div className="flex h-full flex-col">
        <TopBar mobileNav={mobileNav}><span className="text-sm font-medium">EchoLore</span></TopBar>
        <EmptyChat onOpenNewCampaign={onOpenNewCampaign} onOpenSettings={() => onOpenSettings("connection")} hasKey={hasKey} />
      </div>
    );
  }
  return <ActiveChat key={`${userId}:${campaign.id}`} {...props} campaign={campaign} userId={userId} hasKey={hasKey} />;
}

type ActiveProps = ChatWindowProps & { campaign: Campaign; userId: string; hasKey: boolean };

function ActiveChat(props: ActiveProps) {
  const { campaign } = props;
  const [history, setHistory] = useState<Message[]>([]);
  const [historyStatus, setHistoryStatus] = useState<"loading" | "ready" | "error">("loading");
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchHistory(campaign.id, controller.signal).then((messages) => {
      if (controller.signal.aborted) return;
      setHistory(messages);
      setHistoryStatus("ready");
    }).catch((e) => {
      if (controller.signal.aborted) return;
      setHistoryError(e instanceof Error ? e.message : "Could not load your story.");
      setHistoryStatus("error");
    });
    return () => controller.abort();
  }, [campaign.id, attempt]);

  if (historyStatus === "ready") return <ActiveChatInner {...props} initialMessages={history} />;
  return (
    <div className="flex h-full flex-col">
      <TopBar mobileNav={props.mobileNav}><span className="min-w-0 truncate text-sm font-medium">{campaign.title}</span></TopBar>
      {historyStatus === "loading" ? (
        <div className="el-ember-bg flex flex-1 items-center justify-center px-6" role="status">
          <Loader2 className="mr-3 h-5 w-5 animate-spin text-primary" /><p className="text-sm text-muted-foreground">Loading the story so far…</p>
        </div>
      ) : (
        <div className="el-ember-bg flex flex-1 items-center justify-center px-6">
          <div className="max-w-md">
            <h2 className="text-lg font-semibold">Could not load the story</h2>
            <p role="alert" className="mt-2 text-sm leading-relaxed text-muted-foreground">{historyError}</p>
            <Button variant="outline" className="mt-4" onClick={() => { setHistoryStatus("loading"); setHistoryError(null); setAttempt((n) => n + 1); }}>Retry history</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ActiveChatInner({ campaign, userId, hasKey, worldStateJson, worldStateUpdatedAt, lorePending, mobileNav, initialMessages, onOpenSettings, onEditWorld, onRefreshLore }: ActiveProps & { initialMessages: Message[] }) {
  const chatModel = useByokStore((s) => s.config.chatModel);
  const textSize = usePrefsStore((s) => s.textSize);
  const storyFont = usePrefsStore((s) => s.storyFont);
  const setLorePending = useCampaignStore((s) => s.setLorePending);
  const touch = useCampaignStore((s) => s.touch);
  const { toast } = useToast();
  const wide = useMediaQuery("(min-width: 1280px)");
  const [showLore, setShowLore] = useState(false);
  const [loreFresh, setLoreFresh] = useState(false);
  const [input, setInputState] = useState(() => drafts.get(campaign.id) ?? "");
  const [mode, setMode] = useState<Mode>("do");
  const [showLatest, setShowLatest] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [rewindTarget, setRewindTarget] = useState<{ index: number; text: string; count: number } | null>(null);
  const [rewinding, setRewinding] = useState(false);
  const sent = useRef<{ text: string; draft: string; base: UIMessage[] }>({ text: "", draft: "", base: [] });
  const lorePendingRef = useRef(false);
  const busy = useRef(false);
  const nearBottom = useRef(true);
  const reconcileToken = useRef(0);
  const alive = useRef(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const loreTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const setMessagesRef = useRef<(messages: UIMessage[]) => void>(() => {});

  const setInput = useCallback((value: string | ((current: string) => string)) => {
    setInputState((current) => {
      const next = typeof value === "function" ? value(current) : value;
      if (next) drafts.set(campaign.id, next); else drafts.delete(campaign.id);
      return next;
    });
  }, [campaign.id]);

  useEffect(() => {
    alive.current = true;
    const timers = loreTimers.current;
    return () => { alive.current = false; reconcileToken.current += 1; timers.forEach(clearTimeout); };
  }, []);

  const transport = useMemo(() => new DefaultChatTransport({
    api: "/api/chat",
    headers: async () => ({ ...await buildByokHeaders(userId, useByokStore.getState().config) }),
    // A previous reply (or a lorebook update) may still hold the story lock: wait politely.
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      for (let attempt = 0; ; attempt += 1) {
        const response = await fetch(input, init);
        if (response.status !== 409 || attempt >= 15) { setWaiting(false); return response; }
        setWaiting(true);
        try { await sleep(2000, init?.signal); }
        catch (error) { setWaiting(false); throw error; }
      }
    },
    prepareSendMessagesRequest: ({ messages }) => {
      const { responseLength, creativity } = usePrefsStore.getState();
      const last = messages.at(-1);
      return { body: { campaignId: campaign.id, message: last ? textOf(last) : "", options: { responseLength, creativity } } };
    },
  }), [userId, campaign.id]);

  const syncHistory = useCallback(async () => {
    try {
      const server = await fetchHistory(campaign.id);
      if (alive.current) setMessagesRef.current(toUI(server));
      return server;
    } catch { return null; }
  }, [campaign.id]);

  const scheduleLoreRefresh = useCallback(() => {
    loreTimers.current.forEach(clearTimeout);
    const before = useCampaignStore.getState().activeWorldStateUpdatedAt;
    const delays = [4000, 9000, 16000, 28000];
    loreTimers.current = delays.map((delay, index) => setTimeout(async () => {
      if (!alive.current || !lorePendingRef.current) return;
      await onRefreshLore();
      const after = useCampaignStore.getState().activeWorldStateUpdatedAt;
      if (after !== before || index === delays.length - 1) {
        lorePendingRef.current = false;
        setLorePending(false);
        if (after !== before) setLoreFresh(true);
      }
    }, delay));
  }, [onRefreshLore, setLorePending]);

  /** After a Stop or a dropped connection, find out what the server actually saved. */
  const reconcile = useCallback(async () => {
    const token = ++reconcileToken.current;
    const { text, draft, base } = sent.current;
    const anchor = base.at(-1)?.id;
    setSyncing(true);
    for (let attempt = 0; attempt < 24; attempt += 1) {
      await sleep(attempt === 0 ? 800 : 2500).catch(() => {});
      if (!alive.current || token !== reconcileToken.current) return;
      const server = await fetchHistory(campaign.id).catch(() => null);
      if (!server || !alive.current || token !== reconcileToken.current) continue;
      const n = server.length;
      const anchored = anchor && UUID.test(anchor) ? server[n - 3]?.id === anchor : n === base.length + 2 || (n === 2 && base.length === 0);
      if (n >= 2 && anchored && server[n - 2].role === "user" && server[n - 2].content === text && server[n - 1].role === "assistant") {
        setMessagesRef.current(toUI(server));
        setSyncing(false);
        touch(campaign.id);
        return;
      }
      if (attempt >= 3 && n === base.length && (!anchor || server.at(-1)?.id === anchor)) break;
    }
    if (!alive.current || token !== reconcileToken.current) return;
    const server = await fetchHistory(campaign.id).catch(() => null);
    if (server) setMessagesRef.current(toUI(server));
    if (draft) setInput((current) => current.trim() ? current : draft);
    setNotice(draft ? "Nothing was saved from that reply, so your message is back in the composer." : "Nothing was saved from that reply.");
    setSyncing(false);
  }, [campaign.id, setInput, touch]);

  const { messages, setMessages, sendMessage, status, error, stop, clearError } = useChat<UIMessage>({
    id: campaign.id,
    transport,
    messages: toUI(initialMessages),
    onData: (part) => {
      if (part.type === "data-lore") { lorePendingRef.current = true; setLorePending(true); }
    },
    onFinish: ({ isError, isAbort, isDisconnect }) => {
      busy.current = false;
      if (isError) return;
      if (isAbort || isDisconnect) { void reconcile(); return; }
      touch(campaign.id);
      void syncHistory();
      if (lorePendingRef.current) scheduleLoreRefresh();
    },
    onError: () => {
      busy.current = false;
      setMessagesRef.current(sent.current.base);
      const { draft } = sent.current;
      if (draft) setInput((current) => current.trim() ? current : draft);
      if (lorePendingRef.current) { lorePendingRef.current = false; setLorePending(false); }
    },
  });
  useEffect(() => { setMessagesRef.current = setMessages; }, [setMessages]);

  const isStreaming = status === "streaming" || status === "submitted";
  const canAct = !isStreaming && !syncing && !rewinding;
  const lastIndex = messages.length - 1;
  const lastAssistantIndex = messages.at(-1)?.role === "assistant" ? lastIndex : -1;
  const errorText = sendError ?? friendlyError(error);

  useEffect(() => {
    const element = scrollRef.current;
    if (element && nearBottom.current) element.scrollTop = element.scrollHeight;
  }, [messages, status]);
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 220)}px`;
  }, [input]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k" && !document.querySelector('[role="dialog"], [role="alertdialog"]')) {
        event.preventDefault();
        textareaRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const send = useCallback(async (text: string, opts: { draft: string; base?: UIMessage[] }) => {
    const message = text.trim();
    if (!message || busy.current || isStreaming || !hasKey) return;
    busy.current = true;
    reconcileToken.current += 1;
    setSyncing(false);
    sent.current = { text: message, draft: opts.draft, base: opts.base ?? messages };
    setSendError(null);
    setNotice(null);
    clearError();
    lorePendingRef.current = false;
    nearBottom.current = true;
    setShowLatest(false);
    if (opts.draft) setInput("");
    try {
      await sendMessage({ text: message });
    } catch {
      setSendError("Could not send your message. Your draft is kept below.");
      if (opts.draft) setInput((current) => current.trim() ? current : opts.draft);
    } finally {
      busy.current = false;
    }
  }, [isStreaming, hasKey, messages, clearError, setInput, sendMessage]);

  const submitComposer = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    void send(formatMove(mode, text), { draft: input });
  }, [input, mode, send]);

  async function rewindFrom(messageId: string) {
    const headers = await buildAuthHeaders();
    const res = await fetch(`/api/messages/${campaign.id}?from=${encodeURIComponent(messageId)}`, { method: "DELETE", headers });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "Could not rewind the story.");
    }
  }

  async function regenerate() {
    const index = lastAssistantIndex;
    const userMessage = messages[index - 1];
    if (index < 1 || userMessage?.role !== "user" || !UUID.test(userMessage.id) || !canAct) return;
    const text = textOf(userMessage);
    setRewinding(true);
    setNotice(null);
    try {
      await rewindFrom(userMessage.id);
      const base = messages.slice(0, index - 1);
      setMessages(base);
      setRewinding(false);
      await send(text, { draft: "", base });
    } catch (e) {
      setRewinding(false);
      setSendError(e instanceof Error ? e.message : "Could not regenerate.");
    }
  }

  async function confirmRewind() {
    if (!rewindTarget) return;
    const { index, text } = rewindTarget;
    const target = messages[index];
    if (!target || !UUID.test(target.id)) { setRewindTarget(null); return; }
    setRewinding(true);
    try {
      await rewindFrom(target.id);
      setMessages(messages.slice(0, index));
      const direction = parseDirection(text);
      if (direction !== null) { setMode("direct"); setInput(direction); }
      else if (/^"[\s\S]*"$/.test(text)) { setMode("say"); setInput(text.slice(1, -1)); }
      else { setMode("do"); setInput(text); }
      setRewindTarget(null);
      setNotice("Story rewound. Rewrite your move and send it when ready. The lorebook isn’t rolled back, so edit it if anything changed.");
      requestAnimationFrame(() => textareaRef.current?.focus());
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Could not rewind the story.");
      setRewindTarget(null);
    } finally {
      setRewinding(false);
    }
  }

  async function editMessage(id: string, content: string) {
    if (!UUID.test(id)) throw new Error("Wait a moment for this message to finish saving.");
    const config = useByokStore.getState().config;
    const res = await fetch(`/api/messages/${campaign.id}`, {
      method: "PATCH",
      headers: { ...await buildAuthHeaders(), "Content-Type": "application/json", ...(config.openrouterKey.trim() ? { [HDR_OPENROUTER_KEY]: config.openrouterKey.trim() } : {}) },
      body: JSON.stringify({ messageId: id, content }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? "Could not save this edit.");
    setMessages((current) => current.map((m) => (m.id === id ? { ...m, parts: [{ type: "text", text: body.message?.content ?? content }] } : m)));
  }

  const copy = useCallback((text: string) => {
    void navigator.clipboard?.writeText(text).catch(() => {});
  }, []);

  function exportStory() {
    const lines = [`# ${campaign.title}`, "", `> ${campaign.worldDescription.replace(/\n/g, "\n> ")}`, "", `**You:** ${campaign.userPersona}`, "", `**Narrator:** ${campaign.aiPersona}`, "", "---", ""];
    for (const m of messages) {
      const text = textOf(m);
      if (m.role === "user") {
        const direction = parseDirection(text);
        lines.push(direction !== null ? `*[Direction: ${direction}]*` : `**You:** ${text}`, "");
      } else lines.push(text, "");
    }
    const slug = campaign.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "story";
    download(`${slug}.md`, lines.join("\n"));
    toast({ title: "Story exported", description: `Saved ${messages.length} messages as Markdown.` });
  }

  const openLore = () => { setShowLore((open) => !open); setLoreFresh(false); };
  const lorePanel = (
    <LorebookPanel campaign={campaign} userId={userId} worldStateJson={worldStateJson} updatedAt={worldStateUpdatedAt} pending={lorePending}
      onRefresh={() => void onRefreshLore()} onEditWorld={onEditWorld} className="h-full" />
  );
  const currentMode = MODES.find((m) => m.value === mode)!;

  return (
    <div className="flex h-full min-h-0">
      <div className="el-ember-bg relative flex h-full min-h-0 min-w-0 flex-1 flex-col">
        <header className="el-topbar flex shrink-0 items-center gap-2 border-b border-border bg-card px-3 py-2 sm:px-5">
          {mobileNav && <div className="md:hidden">{mobileNav}</div>}
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-2 text-sm font-semibold sm:text-base"><Flame className="hidden h-4 w-4 shrink-0 text-primary sm:block" /><span className="truncate" title={campaign.title}>{campaign.title}</span></h2>
            <p className="truncate text-xs text-muted-foreground" title={campaign.worldDescription}>{campaign.worldDescription}</p>
          </div>
          <Button variant={showLore ? "secondary" : "outline"} size="sm" className="relative h-9 shrink-0 gap-2" aria-expanded={showLore} aria-controls="world-lorebook" onClick={openLore}>
            <BookOpen className="h-4 w-4" /><span className="hidden sm:inline">Lorebook</span><span className="sr-only sm:hidden">Lorebook</span>
            {(lorePending || loreFresh) && <span className={cn("absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-primary", lorePending && "el-pulse-dot")} aria-hidden="true" />}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label="Story options"><MoreVertical className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onSelect={onEditWorld}><Pencil className="mr-2 h-4 w-4" /> Edit world</DropdownMenuItem>
              <DropdownMenuItem onSelect={exportStory} disabled={messages.length === 0}><Download className="mr-2 h-4 w-4" /> Export story (.md)</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onOpenSettings("story")}><SlidersHorizontal className="mr-2 h-4 w-4" /> Storytelling settings</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onOpenSettings("models")}><Cpu className="mr-2 h-4 w-4" /> Change model</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <div ref={scrollRef} role="region" aria-label="Conversation" tabIndex={0} className="min-h-0 flex-1 overflow-y-auto overscroll-contain el-scroll" onScroll={(event) => {
          const element = event.currentTarget;
          nearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 120;
          setShowLatest(!nearBottom.current);
        }}>
          <div className="el-story mx-auto max-w-3xl px-4 py-6 sm:px-6" data-size={textSize} data-font={storyFont}>
            {messages.length === 0 ? (
              <div className="py-10 text-center sm:py-16">
                <PixelCampfire className="mx-auto mb-5 h-20 w-20" />
                <h3 className="el-display text-2xl">Chapter one</h3>
                <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-muted-foreground">Nothing has happened yet. Ask the narrator to open the scene, or write your first move below.</p>
                <Button className="mt-6 h-11 gap-2" onClick={() => void send(OPENING, { draft: "" })} disabled={!hasKey || isStreaming}><Flame className="h-4 w-4" /> Begin the story</Button>
                {!hasKey && <p className="mt-3 text-xs text-muted-foreground">Add your OpenRouter key below to begin.</p>}
              </div>
            ) : (
              <ul className="flex flex-col gap-5 pb-2">
                {messages.map((m, index) => {
                  const text = textOf(m);
                  const streamingThis = isStreaming && index === lastIndex && m.role === "assistant";
                  return (
                    <MessageItem key={m.id} role={m.role} text={text} streaming={streamingThis} isLast={index === lastIndex}
                      canAct={canAct && UUID.test(m.id)}
                      onCopy={copy}
                      onEdit={(content) => editMessage(m.id, content)}
                      onRegenerate={index === lastAssistantIndex && hasKey ? () => void regenerate() : undefined}
                      onRewind={m.role === "user" ? () => setRewindTarget({ index, text, count: messages.length - index }) : undefined} />
                  );
                })}
              </ul>
            )}
            {isStreaming && (status === "submitted" || messages.at(-1)?.role !== "assistant") && (
              <p role="status" className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                <span className="el-typing" aria-hidden="true"><span /><span /><span /></span>
                {waiting ? "Waiting for the previous reply to finish saving…" : "The narrator is thinking…"}
              </p>
            )}
            {syncing && <p role="status" className="flex items-center gap-2 py-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving what was written…</p>}
          </div>
        </div>
        {showLatest && (
          <div className="pointer-events-none absolute inset-x-0 bottom-40 flex justify-center">
            <Button variant="secondary" size="sm" className="pointer-events-auto gap-2 rounded-full shadow-lg" onClick={() => { const element = scrollRef.current; if (element) element.scrollTo({ top: element.scrollHeight, behavior: "smooth" }); nearBottom.current = true; setShowLatest(false); }}><ArrowDown className="h-4 w-4" /> Jump to latest</Button>
          </div>
        )}

        <div className="el-composer shrink-0 border-t border-border bg-card px-3 pt-3 sm:px-6">
          <div className="mx-auto max-w-3xl">
            {errorText && (
              <div role="alert" className="mb-3 flex flex-wrap items-start gap-x-3 gap-y-1 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
                <p className="flex min-w-0 flex-1 items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /><span>{errorText} Your draft is kept below.</span></p>
                <Button variant="link" className="h-auto px-0 py-0.5 text-sm" onClick={() => onOpenSettings("connection")}>Check API settings</Button>
              </div>
            )}
            {notice && !errorText && <p role="status" className="mb-3 rounded-lg bg-secondary/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">{notice}</p>}
            {!hasKey && (
              <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
                <KeyRound className="h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">Add your OpenRouter key to play. Free models cost nothing.</span>
                <Button size="sm" onClick={() => onOpenSettings("connection")}>Add API key</Button>
              </div>
            )}
            {hasKey && messages.length > 0 && !isStreaming && (
              <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1 el-scroll" aria-label="Quick actions">
                <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 rounded-full text-xs" disabled={!canAct} onClick={() => void send(CONTINUE, { draft: "" })}><FastForward className="h-3.5 w-3.5" /> Continue</Button>
                {lastAssistantIndex > 0 && <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 rounded-full text-xs" disabled={!canAct || !UUID.test(messages[lastAssistantIndex]?.id ?? "")} onClick={() => void regenerate()}>{rewinding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Retry reply</Button>}
                <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 rounded-full text-xs" disabled={!canAct} onClick={() => void send(TWIST, { draft: "" })}><Shuffle className="h-3.5 w-3.5" /> Twist</Button>
              </div>
            )}
            <Label htmlFor="story-composer" className="sr-only">Your next move</Label>
            <form className="el-composer-box rounded-2xl border border-input bg-background focus-within:border-primary/60" onSubmit={(event) => { event.preventDefault(); submitComposer(); }}>
              <Textarea id="story-composer" ref={textareaRef} placeholder={currentMode.placeholder} rows={1} value={input} maxLength={16000} aria-describedby="composer-hint"
                onChange={(event) => setInput(event.target.value)}
                onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && !composing.current && event.keyCode !== 229) { event.preventDefault(); submitComposer(); }
                  if (event.key === "Escape" && isStreaming) { event.preventDefault(); void stop(); }
                }}
                className="el-scroll max-h-56 min-h-12 resize-none border-0 bg-transparent px-4 py-3 text-base shadow-none focus-visible:ring-0 dark:bg-transparent sm:text-[15px]" />
              <div className="flex items-center justify-between gap-2 px-2 pb-2">
                <div role="radiogroup" aria-label="Move type" className="flex gap-0.5 rounded-full bg-muted p-0.5">
                  {MODES.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button key={item.value} type="button" role="radio" aria-checked={mode === item.value} onClick={() => { setMode(item.value); textareaRef.current?.focus(); }}
                        className={cn("inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs transition-colors", mode === item.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                        <Icon className="h-3.5 w-3.5" />{item.label}
                      </button>
                    );
                  })}
                </div>
                {isStreaming
                  ? <Button type="button" variant="outline" className="h-9 gap-2 rounded-full" onClick={() => void stop()}><Square className="h-3.5 w-3.5" /> Stop</Button>
                  : <Button type="submit" disabled={!input.trim() || !hasKey || syncing || rewinding} className="h-9 gap-2 rounded-full"><Send className="h-4 w-4" /> Send</Button>}
              </div>
            </form>
            <div id="composer-hint" className="mt-1.5 flex flex-wrap justify-between gap-x-4 gap-y-1 px-1 text-[11px] leading-relaxed text-muted-foreground">
              <span className="hidden sm:inline">Enter to send · Shift+Enter for a new line · Esc to stop · Ctrl/⌘ K to focus</span>
              <span className="truncate" title={chatModel}>{input.length > 12000 ? `${input.length.toLocaleString()} / 16,000 · ` : ""}{chatModel}</span>
            </div>
          </div>
        </div>
      </div>

      {wide ? (
        showLore && <aside className="h-full w-80 shrink-0 border-l border-border 2xl:w-96">{lorePanel}</aside>
      ) : (
        <Sheet open={showLore} onOpenChange={setShowLore}>
          <SheetContent side="right" className="el-world-sheet w-[min(24rem,calc(100%-2rem))] gap-0 bg-card p-0 sm:max-w-sm">
            <SheetTitle className="sr-only">Lorebook</SheetTitle>
            <SheetDescription className="sr-only">The story’s tracked state and world details.</SheetDescription>
            {lorePanel}
          </SheetContent>
        </Sheet>
      )}

      <AlertDialog open={Boolean(rewindTarget)} onOpenChange={(open) => { if (!open && !rewinding) setRewindTarget(null); }}>
        <AlertDialogContent className="el-dialog bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Rewind the story to here?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes this move and the {rewindTarget && rewindTarget.count > 1 ? `${rewindTarget.count - 1} message${rewindTarget.count - 1 === 1 ? "" : "s"} after it` : "reply after it"}, then puts your move back in the composer so you can rewrite it.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rewinding}>Keep story</AlertDialogCancel>
            <AlertDialogAction disabled={rewinding} onClick={(event) => { event.preventDefault(); void confirmRewind(); }}>{rewinding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Rewind</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EmptyChat({ onOpenNewCampaign, onOpenSettings, hasKey }: { onOpenNewCampaign: (template?: WorldTemplate | null) => void; onOpenSettings: () => void; hasKey: boolean }) {
  const featured = WORLD_TEMPLATES.slice(0, 6);
  return (
    <div className="el-ember-bg flex min-h-0 flex-1 overflow-y-auto px-5 py-10 sm:px-10 el-scroll">
      <div className="m-auto w-full max-w-3xl py-4">
        <PixelCampfire className="mb-6 h-16 w-16" />
        <h1 className="el-display text-3xl sm:text-4xl">Welcome to EchoLore</h1>
        <p className="mt-4 max-w-prose text-base leading-8 text-muted-foreground">Pull up a seat by the fire. Pick a world to start in, or build your own from a blank page.</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Button onClick={() => onOpenNewCampaign(null)} className="h-11 gap-2"><Wand2 className="h-4 w-4" /> Create your first world</Button>
          {!hasKey && <Button variant="outline" onClick={onOpenSettings} className="h-11 gap-2"><KeyRound className="h-4 w-4" /> Add your OpenRouter key</Button>}
        </div>
        <h2 className="mt-12 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">Ready-made worlds</h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((template) => (
            <li key={template.id}>
              <button type="button" onClick={() => onOpenNewCampaign(template)} className="el-template flex h-full w-full items-start gap-3 rounded-md border border-border bg-card p-4 text-left">
                <Sigil id={template.id} className="mt-0.5 h-8 w-8 shrink-0" />
                <span className="min-w-0">
                  <span className="block font-medium">{template.label}</span>
                  <span className="block text-xs text-primary">{template.genre}</span>
                  <span className="mt-1.5 block text-sm leading-relaxed text-muted-foreground">{template.blurb}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <dl className="mt-12 grid gap-6 border-t border-border pt-6 text-sm leading-relaxed text-muted-foreground sm:grid-cols-3">
          <div><dt className="font-medium text-foreground">It remembers</dt><dd className="mt-1">Old moments are recalled by meaning, so the stranger you helped in chapter one can show up again in chapter ten.</dd></div>
          <div><dt className="font-medium text-foreground">It keeps notes</dt><dd className="mt-1">Where you are, what you carry and who you’ve met go into a lorebook you can read and edit.</dd></div>
          <div><dt className="font-medium text-foreground">You pick the model</dt><dd className="mt-1">Bring an OpenRouter key and use free or paid models. The key stays in your browser.</dd></div>
        </dl>
      </div>
    </div>
  );
}
