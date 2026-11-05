"use client";

import { Children, cloneElement, isValidElement, memo, useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import { Check, Copy, Loader2, Pencil, RefreshCw, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const QUOTE = /(“[^”]{1,2000}”|"[^"\n]{1,2000}")/g;

/** Wrap quoted dialogue in plain-text children so speech stands out from narration. */
function highlightDialogue(children: ReactNode): ReactNode {
  return Children.map(children, (child) => {
    if (typeof child === "string") {
      const parts = child.split(QUOTE);
      if (parts.length === 1) return child;
      return parts.map((part, index) => (index % 2 === 1 ? <span key={index} className="gm-dialogue">{part}</span> : part));
    }
    if (isValidElement<{ children?: ReactNode }>(child) && (child.type === "em" || child.type === "strong")) {
      return cloneElement(child, undefined, highlightDialogue(child.props.children));
    }
    return child;
  });
}

const markdownComponents: Components = {
  p: ({ children }) => <p>{highlightDialogue(children)}</p>,
  li: ({ children }) => <li>{highlightDialogue(children)}</li>,
  pre: ({ children }) => <pre tabIndex={0} className="el-scroll my-3 max-w-full overflow-x-auto rounded-md bg-card p-3 text-sm">{children}</pre>,
  a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4">{children}</a>,
  img: () => null,
};

const DIRECTION = /^\[Direction:\s*([\s\S]*?)\]$/;

export function parseDirection(text: string): string | null {
  return DIRECTION.exec(text.trim())?.[1] ?? null;
}

export interface MessageActions {
  onCopy: (text: string) => void;
  onEdit: (text: string) => Promise<void>;
  onRegenerate?: () => void;
  onRewind?: () => void;
}

interface MessageItemProps extends MessageActions {
  role: string;
  text: string;
  streaming: boolean;
  canAct: boolean;
  isLast: boolean;
}

function IconAction({ label, onClick, children, disabled }: { label: string; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label}
      className="inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-40">
      {children}
    </button>
  );
}

export const MessageItem = memo(function MessageItem({ role, text, streaming, canAct, isLast, onCopy, onEdit, onRegenerate, onRewind }: MessageItemProps) {
  const isUser = role === "user";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const direction = isUser ? parseDirection(text) : null;

  async function save() {
    const next = draft.trim();
    if (!next || next === text) { setEditing(false); return; }
    setSaving(true);
    setError(null);
    try { await onEdit(next); setEditing(false); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save this edit."); }
    finally { setSaving(false); }
  }

  const actions = !streaming && !editing && (
    <div className={cn("el-msg-actions -ml-2 mt-1 flex flex-wrap items-center gap-0.5", isLast && "el-msg-actions-visible")}>
      <IconAction label={copied ? "Copied" : "Copy message"} onClick={() => { onCopy(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </IconAction>
      <IconAction label="Edit message" onClick={() => { setDraft(text); setError(null); setEditing(true); }} disabled={!canAct}><Pencil className="h-3.5 w-3.5" /></IconAction>
      {isUser && onRewind && <IconAction label="Rewind to here and rewrite" onClick={onRewind} disabled={!canAct}><Undo2 className="h-3.5 w-3.5" /></IconAction>}
      {!isUser && onRegenerate && (
        <IconAction label="Regenerate reply" onClick={onRegenerate} disabled={!canAct}><RefreshCw className="h-3.5 w-3.5" /><span className="hidden sm:inline">Regenerate</span></IconAction>
      )}
    </div>
  );

  return (
    <li className={cn("el-msg group flex min-w-0 flex-col items-start", isUser && "pt-1")}>
      <span className="sr-only">{isUser ? "You:" : "Narrator:"}</span>
      {editing ? (
        <div className="w-full max-w-full">
          <Textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={Math.min(14, Math.max(3, draft.split("\n").length + 1))} maxLength={16000} aria-label="Edited message text" autoFocus className="el-scroll text-base sm:text-sm"
            onKeyDown={(event) => { if (event.key === "Escape") setEditing(false); if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) void save(); }} />
          {error && <p role="alert" className="mt-1 text-sm text-destructive">{error}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void save()} disabled={saving} className="gap-1.5">{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save edit</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving} className="gap-1.5"><X className="h-3.5 w-3.5" /> Cancel</Button>
            <span className="self-center text-xs text-muted-foreground">Ctrl/⌘+Enter to save</span>
          </div>
        </div>
      ) : isUser ? (
        <div className={cn("el-user-bubble min-w-0 max-w-full whitespace-pre-wrap", direction !== null && "el-direction")}>
          {direction !== null ? (
            <><span className="mb-0.5 block font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">Direction</span><span className="italic">{direction}</span></>
          ) : text}
        </div>
      ) : (
        <div className={cn("gm-markdown el-story-text min-w-0 max-w-full", streaming && "el-streaming")}>
          <ReactMarkdown components={markdownComponents}>{text}</ReactMarkdown>
        </div>
      )}
      {actions}
    </li>
  );
});
