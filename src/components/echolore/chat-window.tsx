"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles, Send, KeyRound, Wand2, BookOpen, Brain, Flame,
  Square, AlertCircle, Loader2,
} from "lucide-react";
import type { Campaign, Message } from "@/types/echolore";
import { useMockUser } from "@/hooks/use-mock-user";
import { useByokStore } from "@/store/byok-store";
import { cn } from "@/lib/utils";

interface ChatWindowProps {
  campaign: Campaign | null;
  worldStateJson: string | null;
  onOpenSettings: () => void;
  onOpenNewCampaign: () => void;
}

export function ChatWindow({
  campaign, worldStateJson, onOpenSettings, onOpenNewCampaign,
}: ChatWindowProps) {
  const { userId, ready } = useMockUser();
  const hasKey = useByokStore((s) => s.hasKey());
  const config = useByokStore((s) => s.config);

  if (!campaign) {
    return <EmptyChat onOpenNewCampaign={onOpenNewCampaign} onOpenSettings={onOpenSettings} />;
  }

  if (!hasKey) {
    return <NoKeyGate onOpenSettings={onOpenSettings} />;
  }

  return (
    // Keying on campaign.id forces a fresh ActiveChat mount per campaign —
    // avoids the setState-in-effect pattern by letting React remount state.
    <ActiveChat
      key={campaign.id}
      campaign={campaign}
      worldStateJson={worldStateJson}
      userId={userId}
      ready={ready}
      apiKey={config.apiKey}
      chatModel={config.chatModel}
      loreModel={config.loreModel}
      embedModel={config.embedModel}
      onOpenSettings={onOpenSettings}
    />
  );
}

function NoKeyGate({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <div className="el-ember-bg flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="max-w-md">
        <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/30">
          <KeyRound className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-xl font-semibold text-foreground">
          Add your OpenAI key to begin
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          EchoLore uses your own OpenAI API key for chat, embeddings, and the
          background lorebook. Your key lives only in your browser.
        </p>
        <Button
          onClick={onOpenSettings}
          className="mt-4 gap-2 bg-primary text-primary-foreground hover:bg-[var(--ember-strong)]"
        >
          <KeyRound className="h-4 w-4" /> Add API key
        </Button>
      </div>
    </div>
  );
}

interface ActiveChatProps {
  campaign: Campaign;
  worldStateJson: string | null;
  userId: string | null;
  ready: boolean;
  apiKey: string;
  chatModel: string;
  loreModel: string;
  embedModel: string;
  onOpenSettings: () => void;
}

function ActiveChat({
  campaign, worldStateJson, userId, ready,
  apiKey, chatModel, loreModel, embedModel,
}: ActiveChatProps) {
  // Initial state assumes loading — only set once per mount (which is once per
  // campaign thanks to the `key={campaign.id}` on this component).
  const [history, setHistory] = useState<Message[]>([]);
  const [historyStatus, setHistoryStatus] = useState<"loading" | "ready" | "error">(
    () => (ready && userId ? "loading" : "loading"),
  );
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [showState, setShowState] = useState(false);

  // --- Load persisted history on mount / when user becomes ready ---
  useEffect(() => {
    if (!ready || !userId) return;
    let cancelled = false;
    fetch(`/api/messages/${campaign.id}`, { headers: { "x-user-id": userId } })
      .then(async (r) => {
        if (cancelled) return;
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed to load messages");
        const { messages } = await r.json();
        if (cancelled) return;
        setHistory(messages as Message[]);
        setHistoryStatus("ready");
      })
      .catch((e) => {
        if (cancelled) return;
        setHistoryError((e as Error).message);
        setHistoryStatus("error");
      });
    return () => { cancelled = true; };
  }, [ready, userId, campaign.id]);

  // --- Build the transport with BYOK headers ---
  const transport = useMemo(() => {
    if (!userId) return null;
    return new DefaultChatTransport({
      api: "/api/chat",
      headers: {
        "x-user-id": userId,
        "x-user-api-key": apiKey,
        "x-chat-model": chatModel,
        "x-lore-model": loreModel,
        "x-embed-model": embedModel,
      },
      body: { campaignId: campaign.id },
    });
  }, [userId, apiKey, chatModel, loreModel, embedModel, campaign.id]);

  const { messages, sendMessage, status, error, stop, regenerate } = useChat({
    transport: transport ?? undefined,
    messages: history.map((m) => ({
      id: m.id,
      role: m.role,
      parts: [{ type: "text", text: m.content }],
    })),
  });

  // Auto-scroll to bottom on new messages
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, status]);

  // --- Composer state ---
  const [input, setInput] = useState("");
  const isStreaming = status === "streaming" || status === "submitted";

  const handleSubmit = useCallback(() => {
    const text = input.trim();
    if (!text || isStreaming || !transport) return;
    setInput("");
    sendMessage({ text });
  }, [input, isStreaming, transport, sendMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  // Pretty-printed world state
  const prettyState = useMemo(() => {
    try {
      return worldStateJson ? JSON.stringify(JSON.parse(worldStateJson), null, 2) : "{}";
    } catch {
      return worldStateJson ?? "{}";
    }
  }, [worldStateJson]);

  return (
    <div className="relative flex h-full flex-col el-ember-bg">
      {/* Header */}
      <header className="flex items-center justify-between gap-3 border-b border-border bg-card/60 px-4 py-3 backdrop-blur">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-primary" />
            <h2 className="truncate text-base font-semibold text-foreground">{campaign.title}</h2>
          </div>
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
            {campaign.worldDescription}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setShowState((s) => !s)}
          >
            <BookOpen className="h-3.5 w-3.5" />
            {showState ? "Hide" : "Show"} lorebook
          </Button>
          <Badge variant="outline" className="border-border text-[10px] text-muted-foreground">
            {chatModel}
          </Badge>
        </div>
      </header>

      {/* Persona reminders */}
      <div className="grid gap-2 border-b border-border bg-muted/20 px-4 py-2 md:grid-cols-2">
        <PersonaChip label="You are" text={campaign.userPersona} icon={<Sparkles className="h-3 w-3 text-primary" />} />
        <PersonaChip label="AI is" text={campaign.aiPersona} icon={<Brain className="h-3 w-3 text-primary" />} />
      </div>

      {/* Optional lorebook peek */}
      {showState && (
        <div className="border-b border-border bg-muted/20 px-4 py-3">
          <div className="mx-auto max-w-3xl">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              <BookOpen className="h-3 w-3" />
              Living Lorebook (auto-updated every 4th message)
            </div>
            <pre className="overflow-x-auto rounded-md border border-border bg-background/60 p-3 text-[11px] leading-relaxed text-muted-foreground el-scroll">
              {prettyState}
            </pre>
          </div>
        </div>
      )}

      {/* Chat body */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto el-scroll">
        <div className="mx-auto max-w-3xl px-4 py-6">
          {historyStatus === "loading" ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" />
              Loading the story so far…
            </div>
          ) : historyStatus === "error" ? (
            <div className="mx-auto max-w-md rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <div className="font-medium">Failed to load messages</div>
                  <div className="mt-1 text-xs opacity-80">{historyError}</div>
                </div>
              </div>
            </div>
          ) : messages.length === 0 ? (
            <EmptyConversation campaign={campaign} />
          ) : (
            <ul className="flex flex-col gap-4 pb-4">
              {messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  role={m.role}
                  text={m.parts.map((p) => ("text" in p ? p.text : "")).join("")}
                  streaming={status === "streaming" && m.id === messages[messages.length - 1]?.id && m.role === "assistant"}
                />
              ))}
              {error && (
                <li className="mx-auto max-w-md rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <div>{error.message}</div>
                  </div>
                </li>
              )}
            </ul>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-border bg-card/60 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <Textarea
            placeholder={
              isStreaming
                ? "The story is unfolding…"
                : "What do you do? (Enter to send · Shift+Enter for newline)"
            }
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
            className="min-h-[44px] max-h-48 flex-1 resize-none bg-background/60 text-sm"
          />
          {isStreaming ? (
            <Button
              variant="outline"
              onClick={stop}
              className="gap-2 border-border"
            >
              <Square className="h-4 w-4" /> Stop
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={!input.trim()}
              className="gap-2 bg-primary text-primary-foreground hover:bg-[var(--ember-strong)]"
            >
              <Send className="h-4 w-4" /> Send
            </Button>
          )}
        </div>
        <div className="mx-auto mt-2 flex max-w-3xl items-center justify-between text-[10px] text-muted-foreground/60">
          <span>
            {messages.length} messages this session
            {" · "}
            RAG: top 5 memories + last 5 working
          </span>
          {messages.length > 0 && !isStreaming && (
            <button
              onClick={() => regenerate()}
              className="hover:text-foreground hover:underline"
            >
              ↻ Regenerate last
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function PersonaChip({ label, text, icon }: { label: string; text: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <div className="mt-0.5 flex items-center gap-1 shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
        {icon}
        {label}
      </div>
      <p className="line-clamp-1 text-xs text-muted-foreground" title={text}>
        {text}
      </p>
    </div>
  );
}

function MessageBubble({
  role, text, streaming,
}: { role: string; text: string; streaming?: boolean }) {
  const isUser = role === "user";
  return (
    <li className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-card border border-border text-card-foreground",
        )}
      >
        {!isUser && (
          <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-primary">
            <Flame className="h-3 w-3" /> Game Master
            {streaming && <Loader2 className="ml-1 h-3 w-3 animate-spin" />}
          </div>
        )}
        {text || (isUser ? "" : "…")}
      </div>
    </li>
  );
}

function EmptyConversation({ campaign }: { campaign: Campaign }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card/40 p-6 text-center">
      <Wand2 className="mx-auto h-7 w-7 text-primary/60" />
      <h3 className="mt-3 text-sm font-medium text-foreground">
        The fire is lit. Your story awaits.
      </h3>
      <p className="mt-2 text-xs text-muted-foreground">
        Send your first message below. EchoLore will retrieve relevant memories,
        compile the world state, and stream the Game Master&apos;s reply.
      </p>
      <div className="mt-4 rounded-md border border-border bg-background/40 p-3 text-left text-xs text-muted-foreground">
        <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-primary">
          Opening scene prompt
        </div>
        Try: <span className="text-foreground">&quot;I arrive at the gates. What do I see?&quot;</span>
        {" "}or anything that fits <em>{campaign.title}</em>.
      </div>
    </div>
  );
}

function EmptyChat({
  onOpenNewCampaign, onOpenSettings,
}: { onOpenNewCampaign: () => void; onOpenSettings: () => void }) {
  return (
    <div className="el-ember-bg relative flex h-full flex-col items-center justify-center px-6 py-12 text-center">
      <div className="max-w-lg">
        <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/30">
          <Flame className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Welcome to Echo<span className="text-primary">Lore</span>
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          A BYOK AI roleplay client with RAG memory. Build a world, define who you are,
          and let an AI Game Master remember every twist — powered by vectorized memories
          and a dynamic lorebook.
        </p>

        <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
          <Button
            onClick={onOpenNewCampaign}
            className="gap-2 bg-primary text-primary-foreground hover:bg-[var(--ember-strong)]"
          >
            <Wand2 className="h-4 w-4" /> Forge a new world
          </Button>
          <Button variant="outline" onClick={onOpenSettings} className="gap-2 border-border">
            <KeyRound className="h-4 w-4" /> Add your OpenAI key
          </Button>
        </div>

        <div className="mt-8 grid gap-2 text-left sm:grid-cols-3">
          {[
            { icon: <Wand2 className="h-3.5 w-3.5 text-primary" />, t: "Define the world", d: "World, persona, AI role" },
            { icon: <Brain className="h-3.5 w-3.5 text-primary" />, t: "RAG memory", d: "Top-5 vector recall" },
            { icon: <BookOpen className="h-3.5 w-3.5 text-primary" />, t: "Living lorebook", d: "Auto-updating world state" },
          ].map((f) => (
            <div key={f.t} className="rounded-md border border-border bg-card/40 p-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                {f.icon}
                {f.t}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">{f.d}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
