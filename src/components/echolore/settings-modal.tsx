"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Eye, EyeOff, KeyRound, ShieldCheck, Trash2, ExternalLink, CheckCircle2 } from "lucide-react";
import { useByokStore, DEFAULT_BYOK } from "@/store/byok-store";
import type { LlmProvider } from "@/types/echolore";
import { useToast } from "@/hooks/use-toast";
import { useMounted } from "@/hooks/use-mounted";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PROVIDER_META: Record<LlmProvider, { label: string; signup: string; chatDefault: string; loreDefault: string; note: string }> = {
  gemini: {
    label: "Google Gemini",
    signup: "https://aistudio.google.com/app/apikey",
    chatDefault: "google/gemini-1.5-flash",
    loreDefault: "google/gemini-1.5-flash",
    note: "Generous free tier. Recommended for trying EchoLore without spending a cent.",
  },
  openai: {
    label: "OpenAI",
    signup: "https://platform.openai.com/api-keys",
    chatDefault: "openai/gpt-4o-mini",
    loreDefault: "openai/gpt-4o-mini",
    note: "Also required for embeddings (text-embedding-3-small), regardless of which chat provider you pick.",
  },
  anthropic: {
    label: "Anthropic",
    signup: "https://console.anthropic.com/settings/keys",
    chatDefault: "anthropic/claude-3-5-sonnet-latest",
    loreDefault: "anthropic/claude-3-5-haiku-latest",
    note: "Claude is exceptional at roleplay. Anthropic does not offer embeddings, so an OpenAI key is also required for the RAG layer.",
  },
};

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const { config, setProvider, setKey, setChatModel, setLoreModel, clearAll, hasKey } = useByokStore();
  const { toast } = useToast();

  const [show, setShow] = useState<Record<LlmProvider, boolean>>({
    gemini: false, openai: false, anthropic: false,
  });

  // Hydration-safe: only render after mount so zustand-persist values
  // are available (avoids showing empty inputs for one frame).
  const mounted = useMounted();

  if (!mounted) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-card" />
      </Dialog>
    );
  }

  function commitKey(p: LlmProvider, value: string) {
    setKey(p, value);
  }

  function handleClearAll() {
    clearAll();
    toast({ title: "All API keys cleared", description: "localStorage has been wiped." });
  }

  const activeProvider = config.provider;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto el-scroll bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <KeyRound className="h-5 w-5 text-primary" />
            Bring Your Own Keys
          </DialogTitle>
          <DialogDescription>
            Paste your own LLM API keys. They are stored in your browser&apos;s localStorage only —
            never in the database, never logged. Keys are sent per-request to the server-side
            route handler, which uses them with the Vercel AI SDK.
          </DialogDescription>
        </DialogHeader>

        {/* Active provider selector */}
        <div className="mt-4 grid gap-3">
          <Label className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Active chat provider
          </Label>
          <Tabs
            value={activeProvider}
            onValueChange={(v) => setProvider(v as LlmProvider)}
          >
            <TabsList className="grid w-full grid-cols-3 bg-muted/40">
              <TabsTrigger value="gemini">
                Gemini {hasKey("gemini") && <CheckCircle2 className="ml-1 h-3 w-3 text-primary" />}
              </TabsTrigger>
              <TabsTrigger value="openai">
                OpenAI {hasKey("openai") && <CheckCircle2 className="ml-1 h-3 w-3 text-primary" />}
              </TabsTrigger>
              <TabsTrigger value="anthropic">
                Anthropic {hasKey("anthropic") && <CheckCircle2 className="ml-1 h-3 w-3 text-primary" />}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="gemini" className="mt-4">
              <ProviderPanel
                provider="gemini"
                value={config.keys.gemini ?? ""}
                show={show.gemini}
                onToggleShow={() => setShow((s) => ({ ...s, gemini: !s.gemini }))}
                onChange={(v) => commitKey("gemini", v)}
                chatModel={config.chatModel}
                loreModel={config.loreModel}
                onChatModel={setChatModel}
                onLoreModel={setLoreModel}
                isActive={activeProvider === "gemini"}
              />
            </TabsContent>
            <TabsContent value="openai" className="mt-4">
              <ProviderPanel
                provider="openai"
                value={config.keys.openai ?? ""}
                show={show.openai}
                onToggleShow={() => setShow((s) => ({ ...s, openai: !s.openai }))}
                onChange={(v) => commitKey("openai", v)}
                chatModel={config.chatModel}
                loreModel={config.loreModel}
                onChatModel={setChatModel}
                onLoreModel={setLoreModel}
                isActive={activeProvider === "openai"}
              />
            </TabsContent>
            <TabsContent value="anthropic" className="mt-4">
              <ProviderPanel
                provider="anthropic"
                value={config.keys.anthropic ?? ""}
                show={show.anthropic}
                onToggleShow={() => setShow((s) => ({ ...s, anthropic: !s.anthropic }))}
                onChange={(v) => commitKey("anthropic", v)}
                chatModel={config.chatModel}
                loreModel={config.loreModel}
                onChatModel={setChatModel}
                onLoreModel={setLoreModel}
                isActive={activeProvider === "anthropic"}
              />
            </TabsContent>
          </Tabs>
        </div>

        {/* Security note + embedding warning */}
        <div className="mt-4 rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="space-y-1.5">
              <p>
                <span className="text-foreground font-medium">Storage:</span> Keys live only in
                <code className="mx-1 rounded bg-muted px-1 py-0.5">localStorage</code> on this browser.
                They are attached to API requests via the <code className="mx-1 rounded bg-muted px-1 py-0.5">x-user-api-key</code>
                header and read server-side by the Next.js route handler — never persisted.
              </p>
              <p>
                <span className="text-foreground font-medium">Embeddings:</span> EchoLore uses OpenAI&apos;s
                <code className="mx-1 rounded bg-muted px-1 py-0.5">text-embedding-3-small</code>
                for the RAG memory layer regardless of your chat provider. If you picked Gemini or
                Anthropic, you&apos;ll also need to paste an OpenAI key above for memory to work.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4 gap-2">
          <Button variant="ghost" onClick={handleClearAll} className="mr-auto text-destructive hover:text-destructive">
            <Trash2 className="mr-1 h-4 w-4" /> Clear all keys
          </Button>
          <Button onClick={() => onOpenChange(false)} className="bg-primary text-primary-foreground hover:bg-[var(--ember-strong)]">
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ProviderPanelProps {
  provider: LlmProvider;
  value: string;
  show: boolean;
  onToggleShow: () => void;
  onChange: (v: string) => void;
  chatModel: string;
  loreModel: string;
  onChatModel: (m: string) => void;
  onLoreModel: (m: string) => void;
  isActive: boolean;
}

function ProviderPanel({
  provider, value, show, onToggleShow, onChange, chatModel, loreModel, onChatModel, onLoreModel, isActive,
}: ProviderPanelProps) {
  const meta = PROVIDER_META[provider];
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor={`key-${provider}`}>{meta.label} API Key</Label>
          <a
            href={meta.signup}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Get a key <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <div className="relative">
          <Input
            id={`key-${provider}`}
            type={show ? "text" : "password"}
            placeholder={`Paste your ${meta.label} key…`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="pr-10 font-mono text-xs"
          />
          <button
            type="button"
            onClick={onToggleShow}
            className="absolute inset-y-0 right-0 px-3 text-muted-foreground hover:text-foreground"
            aria-label={show ? "Hide key" : "Show key"}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">{meta.note}</p>
        {value && (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-primary/40 text-primary">
              <CheckCircle2 className="mr-1 h-3 w-3" /> Key set
            </Badge>
            {isActive && (
              <Badge className="bg-primary text-primary-foreground">Active provider</Badge>
            )}
          </div>
        )}
      </div>

      {isActive && (
        <div className="grid gap-3 rounded-md border border-border bg-background/40 p-3">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Model identifiers (Vercel AI SDK)
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <div className="grid gap-1">
              <Label htmlFor="chat-model" className="text-xs">Chat model</Label>
              <Input
                id="chat-model"
                value={chatModel}
                onChange={(e) => onChatModel(e.target.value)}
                className="font-mono text-xs"
                placeholder={meta.chatDefault}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="lore-model" className="text-xs">Lorebook model (cheap)</Label>
              <Input
                id="lore-model"
                value={loreModel}
                onChange={(e) => onLoreModel(e.target.value)}
                className="font-mono text-xs"
                placeholder={meta.loreDefault}
              />
            </div>
          </div>
          <button
            type="button"
            className="justify-self-start text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
            onClick={() => { onChatModel(meta.chatDefault); onLoreModel(meta.loreDefault); }}
          >
            Reset to defaults
          </button>
          <p className="text-[11px] text-muted-foreground/80">
            Default for this provider: <code className="text-foreground">{meta.chatDefault}</code>
            {" / "}
            <code className="text-foreground">{meta.loreDefault}</code>.
            Embedding model is locked to <code className="text-foreground">{DEFAULT_BYOK.embedModel}</code>.
          </p>
        </div>
      )}
    </div>
  );
}
