"use client";

import { useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useCampaignStore } from "@/store/campaign-store";
import type { Campaign } from "@/types/echolore";
import { WORLD_FIELDS } from "./new-campaign-modal";

interface EditWorldModalProps {
  campaign: Campaign | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditWorldModal({ campaign, open, onOpenChange }: EditWorldModalProps) {
  return (
    <Dialog open={open && Boolean(campaign)} onOpenChange={onOpenChange}>
      {open && campaign && <EditWorldBody key={campaign.id} campaign={campaign} onOpenChange={onOpenChange} />}
    </Dialog>
  );
}

function EditWorldBody({ campaign, onOpenChange }: { campaign: Campaign; onOpenChange: (open: boolean) => void }) {
  const update = useCampaignStore((s) => s.update);
  const { toast } = useToast();
  const [form, setForm] = useState({ title: campaign.title, worldDescription: campaign.worldDescription, userPersona: campaign.userPersona, aiPersona: campaign.aiPersona });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const trimmed = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim()])) as typeof form;
    if (Object.values(trimmed).some((value) => !value)) { setError("Fields cannot be blank."); return; }
    const patch = Object.fromEntries(Object.entries(trimmed).filter(([key, value]) => campaign[key as keyof typeof form] !== value));
    if (Object.keys(patch).length === 0) { onOpenChange(false); return; }
    setSaving(true);
    setError(null);
    try {
      await update(campaign.id, patch);
      toast({ title: "World updated", description: "The narrator will follow your changes from the next reply." });
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your changes.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogContent showCloseButton={!saving} onInteractOutside={(event) => event.preventDefault()} className="el-dialog max-h-[calc(100dvh-2rem)] max-w-[calc(100%-2rem)] overflow-y-auto border-border bg-card sm:max-w-2xl el-scroll">
      <DialogHeader className="text-left">
        <DialogTitle className="flex items-center gap-2 pr-8 text-xl"><Pencil className="h-5 w-5 shrink-0 text-primary" /> Edit world</DialogTitle>
        <DialogDescription>Change the setting, your character, or the narrator. Your story so far is kept.</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="min-w-0">
        <fieldset disabled={saving} className="grid min-w-0 gap-5">
          <div className="grid gap-2">
            <Label htmlFor="ew-title">World title</Label>
            <Input id="ew-title" required maxLength={120} value={form.title} onChange={(event) => setForm((f) => ({ ...f, title: event.target.value }))} className="h-11 text-base sm:text-sm" />
          </div>
          {WORLD_FIELDS.map((field) => (
            <div key={field.key} className="grid min-w-0 gap-2">
              <Label htmlFor={`ew-${field.key}`}>{field.label}</Label>
              <Textarea id={`ew-${field.key}`} required rows={field.rows + 1} maxLength={field.max} value={form[field.key]} onChange={(event) => setForm((f) => ({ ...f, [field.key]: event.target.value }))} className="max-h-72 text-base sm:text-sm el-scroll" />
              <p className="text-xs text-muted-foreground">{field.hint} <span className="tabular-nums">{form[field.key].length.toLocaleString()} / {field.max.toLocaleString()}</span></p>
            </div>
          ))}
        </fieldset>
        {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
        <DialogFooter className="mt-6 gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving} className="gap-2">{saving && <Loader2 className="h-4 w-4 animate-spin" />}{saving ? "Saving…" : "Save changes"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
