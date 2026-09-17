"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Send, KeyRound, Wand2, BookOpen, Flame, Square, AlertCircle, Loader2, ArrowDown } from "lucide-react";
import type { Campaign, Message } from "@/types/echolore";
import { useMockUser } from "@/hooks/use-mock-user";
import { useByokStore } from "@/store/byok-store";
import { buildAuthHeaders, buildByokHeaders } from "@/lib/byok/headers";
import { cn } from "@/lib/utils";

interface ChatWindowProps {
  campaign: Campaign | null;
  worldStateJson: string | null;
  onOpenSettings: () => void;
  onOpenNewCampaign: () => void;
}

export function ChatWindow({ campaign, worldStateJson, onOpenSettings, onOpenNewCampaign }: ChatWindowProps) {
  const { userId, ready } = useMockUser();
  const hasKey = useByokStore((s) => Boolean(s.config.openrouterKey.trim()));

  if (!campaign) return <EmptyChat onOpenNewCampaign={onOpenNewCampaign} onOpenSettings={onOpenSettings} hasKey={hasKey} />;
  if (!hasKey) {
    return (
      <div className="el-ember-bg flex h-full items-center justify-center overflow-y-auto px-6 py-8">
        <div className="max-w-md">
          <KeyRound className="mb-5 h-7 w-7 text-primary" />
          <h2 className="text-2xl font-semibold">Your world is ready. Connect your key.</h2>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">EchoLore uses your OpenRouter API key for AI replies, memory search, and lorebook updates. Model availability and costs depend on your OpenRouter account.</p>
          <Button onClick={onOpenSettings} className="mt-5 gap-2"><KeyRound className="h-4 w-4" /> Add API key</Button>
        </div>
      </div>
    );
  }
  return <ActiveChat key={`${userId}:${campaign.id}`} campaign={campaign} worldStateJson={worldStateJson} userId={userId} ready={ready} onOpenSettings={onOpenSettings} />;
}

interface ActiveChatProps {
  campaign: Campaign;
  worldStateJson: string | null;
  userId: string | null;
  ready: boolean;
  onOpenSettings: () => void;
}

function ActiveChat(props: ActiveChatProps) {
  const { campaign, userId, ready } = props;
  const [history, setHistory] = useState<Message[]>([]);
  const [historyStatus, setHistoryStatus] = useState<"loading" | "ready" | "error">("loading");
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!ready || !userId) return;
    const controller = new AbortController();
    async function load() {
      try {
        const headers = await buildAuthHeaders();
        const response = await fetch(`/api/messages/${campaign.id}`, { headers: { ...headers }, signal: controller.signal });
        if (!response.ok) throw new Error("Your story could not be loaded. Check your connection or sign in again, then retry.");
        const data = await response.json();
        if (controller.signal.aborted) return;
        setHistory(data.messages as Message[]);
        setHistoryStatus("ready");
      } catch (e) {
        if (controller.signal.aborted) return;
        setHistoryError(e instanceof Error ? e.message : "Could not load your story.");
        setHistoryStatus("error");
      }
    }
    void load();
    return () => controller.abort();
  }, [ready, userId, campaign.id, attempt]);

  if (historyStatus === "loading") return (
    <div className="el-ember-bg flex h-full items-center justify-center px-6" role="status">
      <Loader2 className="mr-3 h-5 w-5 animate-spin text-primary" /><p className="text-sm text-muted-foreground">Loading the story so far…</p>
    </div>
  );
  if (historyStatus === "error") return (
    <div className="el-ember-bg flex h-full items-center justify-center px-6">
      <div className="max-w-md">
        <h2 className="text-lg font-semibold">Could not load the story</h2>
        <p role="alert" className="mt-2 text-sm leading-relaxed text-muted-foreground">{historyError}</p>
        <Button variant="outline" className="mt-4" onClick={() => { setHistoryStatus("loading"); setHistoryError(null); setAttempt((n) => n + 1); }}>Retry history</Button>
      </div>
    </div>
  );
  return <ActiveChatInner {...props} initialMessages={history} />;
}

function ActiveChatInner({ campaign, worldStateJson, userId, initialMessages, onOpenSettings }: ActiveChatProps & { initialMessages: Message[] }) {
  const chatModel = useByokStore((s) => s.config.chatModel);
  const [showState, setShowState] = useState(false);
  const [input, setInput] = useState("");
  const [showLatest, setShowLatest] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [stopped, setStopped] = useState(false);
  const sentDraft = useRef("");
  const beforeSend = useRef<UIMessage[]>([]);
  const sending = useRef(false);
  const nearBottom = useRef(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transport = useMemo(() => new DefaultChatTransport({
    api: "/api/chat",
    headers: async () => {
      if (!userId) throw new Error("Sign in before sending a message.");
      return { ...await buildByokHeaders(userId, useByokStore.getState().config) };
    },
    prepareSendMessagesRequest: ({ messages }) => ({
      body: {
        campaignId: campaign.id,
        message: messages.at(-1)?.parts.filter((part) => part.type === "text").map((part) => part.text).join("") ?? "",
      },
    }),
  }), [userId, campaign.id]);

  const { messages, setMessages, sendMessage, status, error, stop, clearError } = useChat<UIMessage>({
    transport,
    messages: initialMessages.map((m) => ({ id: m.id, role: m.role, parts: [{ type: "text", text: m.content }] })),
    onFinish: ({ isError, isAbort }) => {
      sending.current = false;
      if (!isError && !isAbort) {
        setInput((current) => current === sentDraft.current ? "" : current);
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
        refreshTimer.current = setTimeout(() => window.dispatchEvent(new CustomEvent("echolore:refresh-lorebook")), 3000);
      }
    },
    onError: () => { sending.current = false; setMessages(beforeSend.current); },
  });
  const isStreaming = status === "streaming" || status === "submitted";

  useEffect(() => () => { if (refreshTimer.current) clearTimeout(refreshTimer.current); }, []);
  useEffect(() => {
    const element = scrollRef.current;
    if (element && nearBottom.current) element.scrollTop = element.scrollHeight;
  }, [messages, status, showState]);
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 192)}px`;
  }, [input]);
  useEffect(() => {
    const focusComposer = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k" && !document.querySelector('[role="dialog"], [role="alertdialog"]')) {
        event.preventDefault();
        textareaRef.current?.focus();
      }
    };
    window.addEventListener("keydown", focusComposer);
    return () => window.removeEventListener("keydown", focusComposer);
  }, []);

  const handleSubmit = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming || sending.current || !userId) return;
    sending.current = true;
    sentDraft.current = input;
    beforeSend.current = messages;
    setSendError(null);
    setStopped(false);
    clearError();
    nearBottom.current = true;
    setShowLatest(false);
    try {
      await sendMessage({ text });
    } catch {
      setSendError("Could not send your message. Your draft is still below.");
    } finally {
      sending.current = false;
    }
  }, [input, isStreaming, userId, clearError, sendMessage, messages]);

  const prettyState = useMemo(() => {
    if (worldStateJson === null) return null;
    try { return JSON.stringify(JSON.parse(worldStateJson), null, 2); }
    catch { return worldStateJson; }
  }, [worldStateJson]);

  return (
    <div className="el-ember-bg relative flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border bg-card px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold"><Flame className="h-4 w-4 shrink-0 text-primary" /><span className="truncate" title={campaign.title}>{campaign.title}</span></h2>
          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{campaign.worldDescription}</p>
        </div>
        <Button variant="outline" size="sm" className="shrink-0 gap-2" aria-expanded={showState} aria-controls="world-lorebook" onClick={() => setShowState((s) => !s)}>
          <BookOpen className="h-4 w-4" /> Lorebook
        </Button>
      </header>
      <div className="hidden shrink-0 gap-4 border-b border-border px-6 py-2 sm:grid sm:grid-cols-2">
        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground" title={campaign.userPersona}><span className="font-medium text-foreground">You: </span>{campaign.userPersona}</p>
        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground" title={campaign.aiPersona}><span className="font-medium text-foreground">Narrator: </span>{campaign.aiPersona}</p>
      </div>
      {showState && (
        <section id="world-lorebook" aria-label="World lorebook" className="min-h-0 max-h-[35%] shrink overflow-y-auto border-b border-border bg-card px-4 py-3 el-scroll">
          <div className="mx-auto max-w-3xl">
            <h3 className="text-sm font-medium">World lorebook</h3>
            <p className="mb-3 mt-1 text-xs leading-relaxed text-muted-foreground">Latest loaded snapshot. Background updates may take time and can miss details.</p>
            {prettyState === null ? <p className="text-sm text-muted-foreground">No lorebook snapshot available. Reopen this world to refresh.</p> : (
              <pre tabIndex={0} aria-label="Lorebook JSON" className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-background p-3 font-mono text-xs leading-relaxed text-foreground el-scroll">{prettyState}</pre>
            )}
          </div>
        </section>
      )}
      <div ref={scrollRef} role="region" aria-label="Conversation" tabIndex={0} className="min-h-0 flex-1 overflow-y-auto overscroll-contain el-scroll" onScroll={(event) => {
        const element = event.currentTarget;
        nearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 96;
        setShowLatest(!nearBottom.current);
      }}>
        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
          {messages.length === 0 ? (
            <div className="py-8">
              <Wand2 className="mb-4 h-6 w-6 text-primary" />
              <h3 className="text-xl font-medium">The fire is lit. Your story awaits.</h3>
              <p className="mt-3 max-w-prose text-sm leading-7 text-muted-foreground">Describe your first action or ask the narrator to set the scene.</p>
              <Button variant="outline" className="mt-4 h-auto whitespace-normal py-3 text-left" onClick={() => { setInput("Set the opening scene. Where am I, and what do I notice?"); textareaRef.current?.focus(); }}>Use an opening prompt</Button>
            </div>
          ) : (
            <ul className="flex flex-col gap-6 pb-4">{messages.map((m) => <MessageBubble key={m.id} role={m.role} text={m.parts.map((p) => p.type === "text" ? p.text : "").join("")} />)}</ul>
          )}
          {isStreaming && <p role="status" className="flex items-center gap-2 py-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin text-primary" />{status === "submitted" ? "Preparing the next scene…" : "The narrator is writing…"}</p>}
        </div>
      </div>
      {showLatest && <div className="flex shrink-0 justify-center py-2"><Button variant="secondary" size="sm" className="gap-2" onClick={() => { const element = scrollRef.current; if (element) element.scrollTop = element.scrollHeight; nearBottom.current = true; setShowLatest(false); }}><ArrowDown className="h-4 w-4" /> Jump to latest</Button></div>}
      <div className="el-composer shrink-0 border-t border-border bg-card px-4 py-3 sm:px-6">
        <div className="mx-auto max-w-3xl">
          {(error || sendError) && <div role="alert" className="mb-3 text-sm"><p className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />{sendError ?? "The reply could not finish. Your draft is kept below; check your connection and API settings before sending again."}</p><Button variant="link" className="h-auto px-0 py-2" onClick={onOpenSettings}>Check API settings</Button></div>}
          {stopped && !error && <p role="status" className="mb-3 text-xs text-muted-foreground">Reply stopped. Your draft is kept; any partial reply may not be saved.</p>}
          <Label htmlFor="story-composer" className="mb-2 block text-sm">Your next move</Label>
          <form className="flex items-end gap-2" onSubmit={(event) => { event.preventDefault(); void handleSubmit(); }}>
            <Textarea id="story-composer" ref={textareaRef} placeholder="What do you do?" rows={1} value={input} maxLength={16000} aria-describedby="composer-hint" onChange={(event) => setInput(event.target.value)} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && !composing.current && event.keyCode !== 229) { event.preventDefault(); void handleSubmit(); }
            }} className="el-scroll min-h-11 max-h-48 flex-1 resize-none overflow-y-auto bg-background text-base sm:text-sm" />
            {isStreaming ? <Button type="button" variant="outline" className="h-11 gap-2" onClick={() => { setStopped(true); void stop(); }}><Square className="h-4 w-4" /> Stop</Button> : <Button type="submit" disabled={!input.trim() || !userId} className="h-11 gap-2"><Send className="h-4 w-4" /> Send</Button>}
          </form>
          <div id="composer-hint" className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs leading-relaxed text-muted-foreground">
            <span>Enter to send · Shift+Enter for a new line · Ctrl/⌘ K to focus</span>
            <span className="tabular-nums">{input.length.toLocaleString()} / 16,000 characters</span>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground" title={chatModel}>{messages.length} messages in view · {chatModel}</p>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ role, text }: { role: string; text: string }) {
  const isUser = role === "user";
  return (
    <li className={cn("flex min-w-0", isUser ? "justify-end" : "justify-start")}>
      <div className={cn("min-w-0 max-w-full text-[15px] leading-7 sm:max-w-[90%]", isUser ? "whitespace-pre-wrap rounded-xl bg-secondary px-4 py-3 text-foreground" : "text-card-foreground")}>
        <p className="mb-2 text-xs font-medium text-primary">{isUser ? "You" : role === "system" ? "Story context" : "Game Master"}</p>
        {isUser ? text : <div className="gm-markdown"><ReactMarkdown components={{ pre: ({ children }) => <pre tabIndex={0} className="el-scroll my-3 max-w-full overflow-x-auto rounded-md bg-card p-3">{children}</pre>, a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4">{children}</a> }}>{text}</ReactMarkdown></div>}
      </div>
    </li>
  );
}

function EmptyChat({ onOpenNewCampaign, onOpenSettings, hasKey }: { onOpenNewCampaign: () => void; onOpenSettings: () => void; hasKey: boolean }) {
  return (
    <div className="el-ember-bg flex h-full overflow-y-auto px-6 py-10 sm:px-10">
      <div className="m-auto w-full max-w-xl py-6">
        <Flame className="mb-6 h-9 w-9 text-primary" />
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Welcome to Echo<span className="text-primary">Lore</span></h1>
        <p className="mt-4 max-w-prose text-base leading-8 text-muted-foreground">A world of your making. A narrator to explore it with. Shape the setting, choose your character, and decide what happens next.</p>
        <Button onClick={onOpenNewCampaign} className="mt-7 h-11 gap-2"><Wand2 className="h-4 w-4" /> Create your first world</Button>
        <div className="mt-9 border-t border-border pt-6">
          <h2 className="text-base font-medium">Your key. Your choice of models.</h2>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">Bring your own key (BYOK) from OpenRouter to power replies, memory search, and lorebook updates. It is saved in this browser and sent through EchoLore’s server to OpenRouter when used. OpenRouter usage charges and model limits apply.</p>
          <Button variant="link" onClick={onOpenSettings} className="mt-2 h-auto px-0 py-2">{hasKey ? "Review API settings" : "Add your OpenRouter key"}</Button>
          <p className="mt-4 text-xs leading-6 text-muted-foreground">You can create a world before adding a key. The lorebook and recalled messages help with continuity, but the narrator can still miss details.</p>
        </div>
      </div>
    </div>
  );
}
