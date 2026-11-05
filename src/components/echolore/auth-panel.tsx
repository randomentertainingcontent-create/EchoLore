"use client";

import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { browserClient } from "@/lib/supabase";
import { completeRecovery, signOutAccount, useMockUser } from "@/hooks/use-mock-user";

type Mode = "signin" | "signup" | "reset";

export function AuthPanel() {
  const { userId, ready, recovery, configured, error: sessionError } = useMockUser();
  const [mode, setMode] = useState<Mode>(recovery ? "reset" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const busy = useRef(false);
  const updating = recovery && Boolean(userId);
  const title = updating ? "Choose a new password" : mode === "signup" ? "Create your account" : mode === "reset" ? "Reset your password" : "Sign in to your worlds";

  function changeMode(next: Mode) {
    setMode(next);
    setPassword("");
    setConfirmation("");
    setError(null);
    setNotice(null);
    if (recovery && !userId) completeRecovery();
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || !ready || !configured) return;
    if (updating && password !== confirmation) {
      setError("Passwords do not match. Enter the same new password in both fields.");
      return;
    }
    busy.current = true;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const auth = browserClient().auth;
      const redirect = new URL("/", window.location.origin);
      if (updating) {
        const { error } = await auth.updateUser({ password });
        if (error) throw error;
        setPassword("");
        setConfirmation("");
        completeRecovery();
      } else if (mode === "signin") {
        const { error } = await auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        setPassword("");
      } else if (mode === "signup") {
        const { data, error } = await auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: redirect.toString() } });
        if (error) throw error;
        setPassword("");
        if (!data.session) setNotice("Check your email to confirm your account, then return here to sign in. If you already have an account, use Sign in or Reset password below.");
      } else {
        redirect.searchParams.set("recovery", "1");
        const { error } = await auth.resetPasswordForEmail(email.trim(), { redirectTo: redirect.toString() });
        if (error) throw error;
        setNotice("If an account exists for this email, a reset link is on its way. Open it to choose a new password here. If it expires, request another link.");
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not complete this request. Please try again.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <section aria-labelledby="auth-title" className="w-full min-w-0 max-w-md">
      <h2 id="auth-title" className="text-2xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">{updating ? "Save a new password to return to your worlds." : mode === "reset" ? "Enter your account email. We’ll send a link back here to set a new password." : "Your worlds and story history belong to your account. An OpenRouter key is only needed when you’re ready to chat."}</p>
      {sessionError && <p role="alert" className="mt-4 break-words text-sm leading-relaxed text-destructive">{sessionError}</p>}
      {!ready && <p role="status" className="mt-4 text-sm text-muted-foreground">Checking your session…</p>}
      {configured && (
        <form onSubmit={submit} className="mt-6" aria-busy={pending}>
          <fieldset disabled={pending || !ready} className="grid min-w-0 gap-4">
            {!updating && <div className="grid gap-2"><Label htmlFor="auth-email">Email</Label><Input id="auth-email" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} className="h-11 text-base" /></div>}
            {(updating || mode !== "reset") && <div className="grid gap-2"><Label htmlFor="auth-password">{updating ? "New password" : "Password"}</Label><Input id="auth-password" name="password" type="password" autoComplete={updating || mode === "signup" ? "new-password" : "current-password"} required minLength={updating || mode === "signup" ? 8 : 1} value={password} onChange={(event) => setPassword(event.target.value)} aria-describedby={updating || mode === "signup" ? "auth-password-hint" : undefined} className="h-11 text-base" />{(updating || mode === "signup") && <p id="auth-password-hint" className="text-xs text-muted-foreground">Use at least 8 characters.</p>}</div>}
            {updating && <div className="grid gap-2"><Label htmlFor="auth-confirmation">Confirm new password</Label><Input id="auth-confirmation" name="confirmation" type="password" autoComplete="new-password" required minLength={8} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="h-11 text-base" /></div>}
            {error && <p role="alert" className="break-words text-sm leading-relaxed text-destructive">{error}</p>}
            {notice && <p role="status" className="text-sm leading-7 text-foreground">{notice}</p>}
            <Button type="submit" className="mt-1 h-11 w-full gap-2">{pending && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}{pending ? "Please wait…" : updating ? "Save password and continue" : mode === "signup" ? "Create account" : mode === "reset" ? "Send reset link" : "Sign in"}</Button>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {updating ? <Button type="button" variant="link" className="h-11 px-0" onClick={() => void signOutAccount()}>Cancel and sign out</Button> : <>
                {mode !== "signin" && <Button type="button" variant="link" className="h-11 px-0" onClick={() => changeMode("signin")}>Back to sign in</Button>}
                {mode === "signin" && <Button type="button" variant="link" className="h-11 px-0" onClick={() => changeMode("signup")}>Create an account</Button>}
                {mode !== "reset" && <Button type="button" variant="link" className="h-11 px-0" onClick={() => changeMode("reset")}>Reset password</Button>}
              </>}
            </div>
          </fieldset>
        </form>
      )}
    </section>
  );
}
