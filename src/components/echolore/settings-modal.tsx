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
import { Badge } from "@/components/ui/badge";
import {
  Eye, EyeOff, KeyRound, ShieldCheck, Trash2,
  ExternalLink, CheckCircle2,
} from "lucide-react";
import { useByokStore, DEFAULT_BYOK } from "@/store/byok-store";
import { useToast } from "@/hooks/use-toast";
import { useMounted } from "@/hooks/use-mounted";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const { config, setApiKey, setChatModel, setLoreModel, clearAll, hasKey } = useByokStore();
  const { toast } = useToast();
  const [show, setShow] = useState(false);
  const mounted = useMounted();

  if (!mounted) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-card" />
      </Dialog>
    );
  }

  function handleClearAll() {
    clearAll();
    toast({ title: "API key cleared", description: "localStorage has been wiped." });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto el-scroll bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <KeyRound className="h-5 w-5 text-primary" />
            OpenAI API Key
          </DialogTitle>
          <DialogDescription>
            Paste your OpenAI API key. It is stored in your browser&apos;s
            <code className="mx-1 rounded bg-muted px-1 py-0.5">localStorage</code> only —
            never in the database, never logged. One key handles chat, lorebook
            updates, and embeddings.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 grid gap-4">
          {/* API key input */}
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="openai-key">API Key</Label>
              <a
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                Get a key <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="relative">
              <Input
                id="openai-key"
                type={show ? "text" : "password"}
                placeholder="sk-..."
                value={config.apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="pr-10 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute inset-y-0 right-0 px-3 text-muted-foreground hover:text-foreground"
                aria-label={show ? "Hide key" : "Show key"}
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Get one at <span className="text-foreground">platform.openai.com/api-keys</span>.
              Keys live in your browser only.
            </p>
            {config.apiKey && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-primary/40 text-primary">
                  <CheckCircle2 className="mr-1 h-3 w-3" /> Key set
                </Badge>
              </div>
            )}
          </div>

          {/* Model identifiers */}
          <div className="grid gap-3 rounded-md border border-border bg-background/40 p-3">
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Model identifiers
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              <div className="grid gap-1">
                <Label htmlFor="chat-model" className="text-xs">Chat</Label>
                <Input
                  id="chat-model"
                  value={config.chatModel}
                  onChange={(e) => setChatModel(e.target.value)}
                  className="font-mono text-xs"
                  placeholder={DEFAULT_BYOK.chatModel}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="lore-model" className="text-xs">Lorebook</Label>
                <Input
                  id="lore-model"
                  value={config.loreModel}
                  onChange={(e) => setLoreModel(e.target.value)}
                  className="font-mono text-xs"
                  placeholder={DEFAULT_BYOK.loreModel}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="embed-model" className="text-xs">Embeddings</Label>
                <Input
                  id="embed-model"
                  value={config.embedModel}
                  disabled
                  className="font-mono text-xs opacity-70"
                />
              </div>
            </div>
            <button
              type="button"
              className="justify-self-start text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
              onClick={() => {
                setChatModel(DEFAULT_BYOK.chatModel);
                setLoreModel(DEFAULT_BYOK.loreModel);
              }}
            >
              Reset chat/lore to defaults
            </button>
            <p className="text-[11px] text-muted-foreground/80">
              Defaults: <code className="text-foreground">{DEFAULT_BYOK.chatModel}</code> for
              chat &amp; lorebook, <code className="text-foreground">{DEFAULT_BYOK.embedModel}</code> for
              embeddings (locked — the RAG dimension is 1536).
            </p>
          </div>
        </div>

        {/* Security note */}
        <div className="mt-4 rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="space-y-1.5">
              <p>
                <span className="text-foreground font-medium">Storage:</span> Your key lives only in
                <code className="mx-1 rounded bg-muted px-1 py-0.5">localStorage</code> on this browser.
                It&apos;s attached to API requests via the
                <code className="mx-1 rounded bg-muted px-1 py-0.5">x-user-api-key</code> header
                and read server-side by the Next.js route handler — never persisted.
              </p>
              <p>
                <span className="text-foreground font-medium">Usage:</span> EchoLore calls OpenAI
                directly using your key. Standard OpenAI billing applies. Avoid using a key with
                unlimited spend — set a usage cap at platform.openai.com.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4 gap-2">
          <Button variant="ghost" onClick={handleClearAll} className="mr-auto text-destructive hover:text-destructive">
            <Trash2 className="mr-1 h-4 w-4" /> Clear key
          </Button>
          <Button
            onClick={() => onOpenChange(false)}
            className="bg-primary text-primary-foreground hover:bg-[var(--ember-strong)]"
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
