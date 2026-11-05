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
import type { Campaign } from "@/types/echolore";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useToast } from "@/hooks/use-toast";
import { useByokStore } from "@/store/byok-store";
import { usePrefsStore } from "@/store/prefs-store";
import { useCampaignStore } from "@/store/campaign-store";
import { buildByokHeaders } from "@/lib/byok/headers";
import { localDb, recall, type StoredMessage } from "@/lib/local-db";
import { embedTexts, requestLoreUpdate } from "@/lib/story-client";
import { fitWorkingMemory } from "@/lib/rag/compile-prompt";
import { cn } from "@/lib/utils";
import { MessageItem, parseDirection } from "./message-item";
import { LorebookPanel } from "./lorebook-panel";
import { WORLD_TEMPLATES, type WorldTemplate } from "./presets";
import { PixelCampfire, Sigil } from "./pixel-art";
import type { SettingsTab } from "./settings-modal";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPENING = "[Direction: Set the opening scene. Show me where I am and what I notice, introduce someone or something that matters, and give me a reason to act.]";
const CONTINUE = "[Direction: Continue the scene naturally from where it left off.]";
const TWIST = "[Direction: Introduce an unexpected but fitting twist.]";
/** The lorebook keeper runs after every Nth stored message (2 per turn). */
const LORE_EVERY = 4;

/** Composer drafts survive switching worlds (in memory only). */
const drafts = new Map<string, string>();

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

function toUI(messages: StoredMessage[]): UIMessage[] {
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
    if (typeof parsed.error === "string") return parsed.error.endsWith(".") ? parsed.error : `${parsed.error}.`;
  } catch {}
  if (/failed to fetch|network/i.test(raw)) return "Couldn’t reach EchoLore. Check your connection.";
  return raw && raw.length < 300 ? raw : "The reply could not finish.";
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

function parseState(json: string | null): Record<string, unknown> {
  try {
    const value: unknown = json ? JSON.parse(json) : {};
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch { return {}; }
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
  const hasKey = useByokStore((s) => Boolean(s.config.openrouterKey.trim()));

  if (!campaign) {
    return (
      <div className="flex h-full flex-col">
        <TopBar mobileNav={mobileNav}><span className="text-sm font-medium">EchoLore</span></TopBar>
        <EmptyChat onOpenNewCampaign={onOpenNewCampaign} onOpenSettings={() => onOpenSettings("connection")} hasKey={hasKey} />
      </div>
    );
  }
  return <ActiveChat key={campaign.id} {...props} campaign={campaign} hasKey={hasKey} />;
}

type ActiveProps = ChatWindowProps & { campaign: Campaign; hasKey: boolean };

function ActiveChat(props: ActiveProps) {
  const { campaign } = props;
  const [history, setHistory] = useState<StoredMessage[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    localDb.listMessages(campaign.id).then((messages) => { if (!cancelled) setHistory(messages); })
      .catch((e) => { if (!cancelled) setHistoryError(e instanceof Error ? e.message : "Could not load your story."); });
    return () => { cancelled = true; };
  }, [campaign.id, attempt]);

  if (history) return <ActiveChatInner {...props} initialMessages={history} />;
  return (
    <div className="flex h-full flex-col">
      <TopBar mobileNav={props.mobileNav}><span className="min-w-0 truncate text-sm font-medium">{campaign.title}</span></TopBar>
      {!historyError ? (
        <div className="el-ember-bg flex flex-1 items-center justify-center px-6" role="status">
          <Loader2 className="mr-3 h-5 w-5 animate-spin text-primary" /><p className="text-sm text-muted-foreground">Loading the story so far…</p>
        </div>
      ) : (
        <div className="el-ember-bg flex flex-1 items-center justify-center px-6">
          <div className="max-w-md">
            <h2 className="text-lg font-semibold">Could not load the story</h2>
            <p role="alert" className="mt-2 text-sm leading-relaxed text-muted-foreground">{historyError}</p>
            <Button variant="outline" className="mt-4" onClick={() => { setHistoryError(null); setAttempt((n) => n + 1); }}>Retry history</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ActiveChatInner({ campaign, hasKey, worldStateJson, worldStateUpdatedAt, lorePending, mobileNav, initialMessages, onOpenSettings, onEditWorld, onRefreshLore }: ActiveProps & { initialMessages: StoredMessage[] }) {
  const chatModel = useByokStore((s) => s.config.chatModel);
  const textSize = usePrefsStore((s) => s.textSize);
  const storyFont = usePrefsStore((s) => s.storyFont);
  const setLorePending = useCampaignStore((s) => s.setLorePending);
  const saveLore = useCampaignStore((s) => s.saveLore);
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
  const [syncing, setSyncing] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [rewindTarget, setRewindTarget] = useState<{ index: number; text: string; count: number } | null>(null);
  const [rewinding, setRewinding] = useState(false);
  /** The saved story, in order. The single source of truth for persistence. */
  const records = useRef<StoredMessage[]>(initialMessages);
  const sent = useRef<{ text: string; draft: string; base: StoredMessage[]; embedding: number[] | null }>({ text: "", draft: "", base: [], embedding: null });
  const busy = useRef(false);
  const nearBottom = useRef(true);
  const alive = useRef(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const setMessagesRef = useRef<(messages: UIMessage[]) => void>(() => {});
  const openRef = useRef(showLore);

  useEffect(() => { openRef.current = showLore; }, [showLore]);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const setInput = useCallback((value: string | ((current: string) => string)) => {
    setInputState((current) => {
      const next = typeof value === "function" ? value(current) : value;
      if (next) drafts.set(campaign.id, next); else drafts.delete(campaign.id);
      return next;
    });
  }, [campaign.id]);

  // The request body is assembled in `send` (memory recall included), so the transport stays stateless.
  const transport = useMemo(() => new DefaultChatTransport({
    api: "/api/chat",
    headers: () => ({ ...buildByokHeaders(useByokStore.getState().config) }),
    prepareSendMessagesRequest: ({ body }) => ({ body: body ?? {} }),
  }), []);

  /** World, lorebook, working memory and recalled memories for one reply. */
  const buildRequest = useCallback(async (message: string, base: StoredMessage[]) => {
    const { responseLength, creativity } = usePrefsStore.getState();
    const working = fitWorkingMemory([...base].reverse().filter((m) => m.role !== "system"), 24000, 16);
    const inWorking = new Set(working.map((m) => m.id));
    const vectors = await embedTexts([message]);
    const memories = vectors ? recall(vectors[0], base, inWorking, 5).map(({ message: m, similarity }) => ({
      role: m.role === "user" ? "user" as const : "assistant" as const, content: m.content.slice(0, 8000), similarity, createdAt: m.createdAt,
    })) : [];
    const { id, worldDescription, userPersona, aiPersona } = campaign;
    const stored = await localDb.getCampaign(id).catch(() => null);
    return {
      embedding: vectors?.[0] ?? null,
      body: {
        world: { worldDescription, userPersona, aiPersona },
        worldState: stored?.worldState ?? parseState(useCampaignStore.getState().activeWorldState),
        history: working.map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content })),
        memories,
        message,
        options: { responseLength, creativity },
      },
    };
  }, [campaign]);

  /** Every couple of turns, let the keeper update the lorebook in the background. */
  const runLore = useCallback(async () => {
    const id = campaign.id;
    setLorePending(true);
    try {
      const stored = await localDb.getCampaign(id);
      const state = await requestLoreUpdate(stored?.worldState ?? {}, records.current.slice(-LORE_EVERY));
      await saveLore(id, state);
      if (alive.current && !openRef.current) setLoreFresh(true);
    } catch {
      // The keeper is best-effort; the story continues without it.
    } finally {
      if (useCampaignStore.getState().activeId === id) setLorePending(false);
    }
  }, [campaign.id, saveLore, setLorePending]);

  /** Save a finished (or stopped) turn to this browser. */
  const persistTurn = useCallback(async (replyText: string, stopped: boolean) => {
    const { text, draft, base, embedding } = sent.current;
    const reply = replyText.trim().slice(0, 16000);
    if (!reply) {
      setMessagesRef.current(toUI(base));
      if (draft) setInput((current) => current.trim() ? current : draft);
      setNotice(draft ? "Stopped before the narrator wrote anything, so your move is back in the composer." : "Stopped before the narrator wrote anything.");
      return;
    }
    setSyncing(true);
    const now = Date.now();
    const id = campaign.id;
    const userRecord: StoredMessage = { id: crypto.randomUUID(), campaignId: id, role: "user", content: text, createdAt: new Date(now).toISOString(), embedding };
    const replyRecord: StoredMessage = { id: crypto.randomUUID(), campaignId: id, role: "assistant", content: reply, createdAt: new Date(now + 1).toISOString(), embedding: null };
    try {
      await localDb.putMessages([userRecord, replyRecord]);
      records.current = [...base, userRecord, replyRecord];
      if (alive.current) setMessagesRef.current(toUI(records.current));
      if (stopped) setNotice("Reply stopped. What the narrator wrote so far is saved.");
      void touch(id);
      void embedTexts([reply]).then(async (vectors) => {
        if (!vectors) return;
        replyRecord.embedding = vectors[0];
        await localDb.putMessages([replyRecord]).catch(() => {});
      });
      if (records.current.length % LORE_EVERY === 0) void runLore();
    } catch (e) {
      setSendError(e instanceof Error ? `Couldn’t save that turn: ${e.message}` : "Couldn’t save that turn.");
    } finally {
      if (alive.current) setSyncing(false);
    }
  }, [campaign.id, runLore, setInput, touch]);

  const { messages, setMessages, sendMessage, status, error, stop, clearError } = useChat<UIMessage>({
    id: campaign.id,
    transport,
    messages: toUI(initialMessages),
    onFinish: ({ message, isError, isAbort, isDisconnect }) => {
      busy.current = false;
      if (isError) return;
      void persistTurn(message.role === "assistant" ? textOf(message) : "", isAbort || isDisconnect);
    },
    onError: () => {
      busy.current = false;
      setMessagesRef.current(toUI(sent.current.base));
      const { draft } = sent.current;
      if (draft) setInput((current) => current.trim() ? current : draft);
    },
  });
  useEffect(() => { setMessagesRef.current = setMessages; }, [setMessages]);

  const isStreaming = status === "streaming" || status === "submitted";
  const canAct = !isStreaming && !syncing && !rewinding && !preparing;
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

  const send = useCallback(async (text: string, opts: { draft: string }) => {
    const message = text.trim();
    if (!message || busy.current || isStreaming || syncing || !hasKey) return;
    busy.current = true;
    const base = records.current;
    setSendError(null);
    setNotice(null);
    clearError();
    nearBottom.current = true;
    setShowLatest(false);
    if (opts.draft) setInput("");
    setPreparing(true);
    try {
      const request = await buildRequest(message, base);
      sent.current = { text: message, draft: opts.draft, base, embedding: request.embedding };
      setPreparing(false);
      await sendMessage({ text: message }, { body: request.body });
    } catch {
      setSendError("Could not send your message.");
      if (opts.draft) setInput((current) => current.trim() ? current : opts.draft);
    } finally {
      setPreparing(false);
      busy.current = false;
    }
  }, [isStreaming, syncing, hasKey, clearError, setInput, sendMessage, buildRequest]);

  const submitComposer = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    void send(formatMove(mode, text), { draft: input });
  }, [input, mode, send]);

  /** Remove a message and everything after it. */
  async function rewindFrom(index: number) {
    const removed = records.current.slice(index);
    await localDb.deleteMessages(removed.map((m) => m.id));
    records.current = records.current.slice(0, index);
    setMessages(toUI(records.current));
  }

  async function regenerate() {
    const index = lastAssistantIndex;
    const userMessage = records.current[index - 1];
    if (index < 1 || userMessage?.role !== "user" || !canAct) return;
    setRewinding(true);
    setNotice(null);
    try {
      await rewindFrom(index - 1);
      setRewinding(false);
      await send(userMessage.content, { draft: "" });
    } catch (e) {
      setRewinding(false);
      setSendError(e instanceof Error ? e.message : "Could not regenerate.");
    }
  }

  async function confirmRewind() {
    if (!rewindTarget) return;
    const { index, text } = rewindTarget;
    setRewinding(true);
    try {
      await rewindFrom(index);
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
    const index = records.current.findIndex((m) => m.id === id);
    if (index === -1) throw new Error("Wait a moment for this message to finish saving.");
    const updated: StoredMessage = { ...records.current[index], content, embedding: null };
    await localDb.putMessages([updated]);
    records.current = records.current.map((m) => (m.id === id ? updated : m));
    setMessages((current) => current.map((m) => (m.id === id ? { ...m, parts: [{ type: "text", text: content }] } : m)));
    void embedTexts([content]).then(async (vectors) => {
      if (!vectors) return;
      updated.embedding = vectors[0];
      await localDb.putMessages([updated]).catch(() => {});
    });
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
    <LorebookPanel campaign={campaign} worldStateJson={worldStateJson} updatedAt={worldStateUpdatedAt} pending={lorePending}
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
            {(preparing || (isStreaming && (status === "submitted" || messages.at(-1)?.role !== "assistant"))) && (
              <p role="status" className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                <span className="el-typing" aria-hidden="true"><span /><span /><span /></span>
                {preparing ? "Recalling the story…" : "The narrator is thinking…"}
              </p>
            )}
            {syncing && <p role="status" className="flex items-center gap-2 py-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</p>}
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
                  : <Button type="submit" disabled={!input.trim() || !hasKey || syncing || rewinding || preparing} className="h-9 gap-2 rounded-full"><Send className="h-4 w-4" /> Send</Button>}
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
