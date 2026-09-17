"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, KeyRound, Trash2, ExternalLink } from "lucide-react";
import { useByokStore, DEFAULT_BYOK } from "@/store/byok-store";
import { useToast } from "@/hooks/use-toast";
import { useMounted } from "@/hooks/use-mounted";
import { EMBED_MODEL, EMBED_DIMENSIONS } from "@/lib/byok/headers";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const mounted = useMounted();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="el-dialog max-h-[calc(100dvh-2rem)] max-w-[calc(100%-2rem)] overflow-y-auto bg-card border-border sm:max-w-xl el-scroll">
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2 pr-6 text-xl"><KeyRound className="h-5 w-5 shrink-0 text-primary" /> API settings</DialogTitle>
          <DialogDescription className="leading-relaxed">Bring your own OpenRouter key for chat, memory search, and lorebook updates. Changes save automatically in this browser.</DialogDescription>
        </DialogHeader>
        {mounted && open && <SettingsFields onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function SettingsFields({ onDone }: { onDone: () => void }) {
  const { config, setOpenrouterKey, setChatModel, setLoreModel, clearAll } = useByokStore();
  const { toast } = useToast();
  const [show, setShow] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <>
      <div className="grid gap-6 py-2">
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="or-key">OpenRouter API key</Label>
            <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 py-1 text-sm text-primary underline-offset-4 hover:underline">Get a key <ExternalLink className="h-3 w-3" /><span className="sr-only"> (opens in new tab)</span></a>
          </div>
          <div className="relative">
            <Input id="or-key" type={show ? "text" : "password"} placeholder="sk-or-v1-…" value={config.openrouterKey} maxLength={512} onChange={(event) => setOpenrouterKey(event.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} aria-describedby="key-hint" className="h-11 pr-12 font-mono text-base sm:text-sm" />
            <button type="button" onClick={() => setShow((value) => !value)} className="absolute inset-y-0 right-0 w-11 rounded-md text-muted-foreground hover:text-foreground" aria-label={show ? "Hide key" : "Show key"} aria-pressed={show}>{show ? <EyeOff className="mx-auto h-4 w-4" /> : <Eye className="mx-auto h-4 w-4" />}</button>
          </div>
          <p id="key-hint" className="text-xs leading-relaxed text-muted-foreground">{config.openrouterKey.trim() ? "Key saved on this browser. It has not been verified." : "A key is required to chat. Creating a world does not require one."}</p>
        </div>
        <fieldset className="grid min-w-0 gap-4 border-t border-border pt-4">
          <legend className="pr-2 text-sm font-medium">Models</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><Label htmlFor="chat-model">Chat model</Label><Input id="chat-model" value={config.chatModel} maxLength={200} spellCheck={false} autoCapitalize="none" onChange={(event) => setChatModel(event.target.value)} placeholder={DEFAULT_BYOK.chatModel} aria-describedby="model-hint" className="font-mono text-base sm:text-sm" /></div>
            <div className="grid gap-2"><Label htmlFor="lore-model">Lorebook model</Label><Input id="lore-model" value={config.loreModel} maxLength={200} spellCheck={false} autoCapitalize="none" onChange={(event) => setLoreModel(event.target.value)} placeholder={DEFAULT_BYOK.loreModel} aria-describedby="model-hint" className="font-mono text-base sm:text-sm" /></div>
          </div>
          <p id="model-hint" className="text-xs leading-relaxed text-muted-foreground">Use the exact OpenRouter model identifier (up to 200 characters, no spaces). Availability, rate limits, and pricing vary by model.</p>
          <div className="grid gap-2"><Label htmlFor="embed-model">Embedding model · fixed for memory compatibility</Label><Input id="embed-model" value={EMBED_MODEL} readOnly aria-describedby="embed-hint" className="font-mono text-base text-muted-foreground sm:text-sm" /><p id="embed-hint" className="text-xs text-muted-foreground">{EMBED_DIMENSIONS.toLocaleString()} dimensions. Used to search relevant story messages.</p></div>
          <Button variant="link" className="h-auto justify-self-start px-0 py-1 text-sm" onClick={() => { setChatModel(DEFAULT_BYOK.chatModel); setLoreModel(DEFAULT_BYOK.loreModel); }}>Reset chat and lorebook models</Button>
        </fieldset>
        <div className="border-t border-border pt-4 text-sm leading-7 text-muted-foreground">
          <p>Your key is saved in this browser’s local storage and sent through EchoLore’s server to OpenRouter when used. Only add a key on a device you trust.</p>
          <p className="mt-2">OpenRouter usage charges apply, including for embeddings. Check your provider’s balance and spending limits before a long session.</p>
        </div>
      </div>
      {confirmClear && <div className="rounded-md border border-border p-3 text-sm"><p>Remove the saved key and reset all model settings on this browser? Your worlds and messages will not be deleted. This does not revoke the key at OpenRouter.</p><div className="mt-3 flex flex-wrap gap-2"><Button variant="destructive" size="sm" onClick={() => { clearAll(); setShow(false); setConfirmClear(false); toast({ title: "API settings reset", description: "Saved key removed and models reset on this browser. Worlds and messages are unchanged." }); }}>Clear and reset</Button><Button variant="outline" size="sm" onClick={() => setConfirmClear(false)}>Keep settings</Button></div></div>}
      <DialogFooter className="gap-2">
        <Button variant="ghost" onClick={() => setConfirmClear(true)} className="sm:mr-auto"><Trash2 className="mr-2 h-4 w-4" /> Clear key and reset models</Button>
        <Button onClick={onDone}>Done</Button>
      </DialogFooter>
    </>
  );
}
