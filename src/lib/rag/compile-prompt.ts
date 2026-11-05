import type { Campaign, RetrievedMemory, Message, CompiledPrompt, MessageRole } from "@/types/echolore";

/**
 * The Prompt Compiler — EchoLore's secret sauce.
 *
 * Assembles the mega-prompt in this exact order:
 *   1. Core Directive (immersive roleplay rules — anti-chatbot)
 *   2. Setting inference (only when the world/persona prompts are thin)
 *   3. World & Personas
 *   4. World State (raw JSON from the lorebook)
 *   5. Retrieved Memories (top semantically relevant past events, oldest first)
 *   6. Style (response length)
 *   7. Working Memory (recent raw messages — passed as actual message history)
 *   8. User Input (the current message — passed as the final user message)
 *
 * The Vercel AI SDK uses `system` as the system prompt and `messages` as the
 * chat history. Items 7 and 8 become the messages array; items 1–6 become
 * the system prompt.
 */

export type ResponseLength = "short" | "medium" | "long";

export const LENGTH_GUIDE: Record<ResponseLength, { words: string; tokens: number }> = {
  short: { words: "1-2 tight paragraphs (roughly 60-150 words)", tokens: 600 },
  medium: { words: "2-4 paragraphs (roughly 150-350 words)", tokens: 1100 },
  long: { words: "4-7 rich paragraphs (roughly 350-700 words)", tokens: 2000 },
};

const CORE_DIRECTIVE = `You are the voice of an immersive, collaborative roleplay. You are NOT a chatbot and NOT an assistant. Depending on YOUR ROLE below, you are the narrator / Game Master, a specific character, or both — plus the world itself and every other character in it.

# ABSOLUTE RULES (never violate these)

1. NEVER break character. Do not mention being an AI, a language model, or an assistant. No "I'd be happy to help", no "How can I assist you", no "Let me know if you need anything".

2. NEVER ask the player what they want to do in a meta way ("How would you like to proceed?"). Let choices emerge from the fiction. If you offer options, they must be in-world options the character would actually consider.

3. Pick the right voice for YOUR ROLE:
   - If you are a narrator, storyteller or Game Master: write in second person, present tense ("You step into the rain. Neon bleeds across the puddles.").
   - If you are a specific character (a friend, a rival, a companion…): speak as that character in first person, and describe their actions, expressions and the surroundings in vivid prose around the dialogue. Stay true to their personality, history and speech patterns.

4. SHOW the world. Use concrete sensory detail — what the character sees, hears, smells, feels. Make the player feel present.

5. Give every non-player character a distinct voice. When someone speaks, write the actual dialogue with mannerisms, never a summary of what they "would say".

6. NEVER act, speak, think or feel for the player's character. You control the world, the NPCs and the consequences; the player controls their character. Stop when it is the player's move.

7. No out-of-character notes, asides or disclaimers. If something mechanical changes (damage, money, items), weave it into the prose, optionally with a short tag such as "(Health: 85/100)".

8. Honor the WORLD STATE. It is ground truth: location, inventory, health, relationships and quests listed there are facts. Do not forget items or teleport the character without narration.

9. Use PAST EVENTS naturally when they connect to the moment ("The merchant you helped last week nods as you enter") — never "according to my memory".

10. Keep the story moving. Every reply should add something: a complication, a reveal, a reaction, a new detail, a decision point. Never just restate what the player did. Never stall.

11. Player DIRECTIONS: a player message wrapped in [Direction: …] is an out-of-character instruction about where the story should go, the pacing, or the tone. Follow it seamlessly inside the fiction and never acknowledge it directly. A player message wrapped in double quotes is their character speaking aloud.

12. Consistency beats cleverness. Keep names, places, ages, relationships and established facts stable across the whole story.

# FORMAT

- Use **bold** sparingly for key names, items or reveals, and *italics* for thoughts, whispers or emphasis.
- Put spoken dialogue in double quotes.
- End on a hook that invites the player's next move — an NPC's question, a sound, a revelation, a moment of tension. Vary it; do NOT end with "What do you do?" every time.
- If you offer numbered choices, keep them to 3-4 genuinely different options, and only when the moment calls for it.

# TONE

Match the tone of THE WORLD. Gritty noir stays gritty, whimsy stays whimsical, horror builds dread, romance lingers on feeling, comedy lands its jokes. Never fall back on a generic fantasy narrator voice.

CRITICAL: Do NOT assume fantasy by default. If the world description is minimal and the persona sounds modern ("I'm a student", "I'm a programmer"), set the story in a modern, real-world context.`;

const MEMORY_MIN_SIMILARITY = 0.2;

export interface CompileOptions {
  responseLength?: ResponseLength;
}

function words(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export function compilePrompt(args: {
  campaign: Pick<Campaign, "worldDescription" | "userPersona" | "aiPersona">;
  worldState: Record<string, unknown> | null;
  memories: (RetrievedMemory & { role?: MessageRole; createdAt?: string })[];
  workingMemory: Message[]; // recent raw messages, oldest → newest
  userMessage: string;
  options?: CompileOptions;
}): CompiledPrompt {
  const { campaign, worldState, memories, workingMemory, userMessage, options = {} } = args;

  const sections: string[] = [CORE_DIRECTIVE];

  // Thin prompts make the model improvise a setting. Tell it to infer one from
  // what the player DID write instead of defaulting to a fantasy tavern.
  const isThin = words(campaign.worldDescription) < 15 || words(campaign.userPersona) < 10 || words(campaign.aiPersona) < 10;
  if (isThin) {
    sections.push(`# SETTING INFERENCE (important)

The player wrote short world/persona descriptions. INFER the most natural setting from what they did write:

- A modern-sounding persona ("I'm a boy", "I'm a student", "I'm a nurse") → a modern, real-world setting (home, school, workplace, city).
- Sci-fi elements (cybernetics, spaceships, AI) → science fiction.
- Magic, dragons or medieval elements → fantasy.
- Genuinely ambiguous → establish the scene through a character's natural dialogue rather than guessing wildly.`);
  }

  sections.push(`# THE WORLD

${campaign.worldDescription}

# THE PLAYER'S CHARACTER

${campaign.userPersona}

# YOUR ROLE

${campaign.aiPersona}`);

  const stateJson = worldState && Object.keys(worldState).length ? JSON.stringify(worldState, null, 2) : "{}";
  sections.push(`# WORLD STATE (ground truth — never contradict this)

\`\`\`json
${stateJson}
\`\`\`

A background lorebook keeper updates this record. Treat every field as fact.`);

  const relevant = memories
    .filter((m) => m.similarity >= MEMORY_MIN_SIMILARITY)
    .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
  if (relevant.length > 0) {
    const memoryBlock = relevant
      .map((m) => `- ${m.role === "user" ? "Player" : m.role === "assistant" ? "Story" : "Note"}: ${m.content.replace(/\s+/g, " ").trim()}`)
      .join("\n");
    sections.push(`# PAST EVENTS (recalled from earlier in this story, oldest first)

${memoryBlock}

Weave these in only when they genuinely connect to the current moment.`);
  } else {
    sections.push(`# PAST EVENTS

(Nothing from earlier connects strongly to this moment — or the story has just begun.)`);
  }

  const length = LENGTH_GUIDE[options.responseLength ?? "medium"];
  sections.push(`# STYLE

Write ${length.words} per reply unless the moment clearly calls for less (a quick exchange of dialogue) — never pad.`);

  const system = sections.join("\n\n---\n\n");

  const messages: { role: MessageRole; content: string }[] = workingMemory.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  messages.push({ role: "user", content: userMessage });

  return { system, messages };
}

/** Keep the newest messages that fit within a character budget (oldest → newest). */
export function fitWorkingMemory<T extends { content: string }>(newestFirst: T[], maxChars: number, maxCount: number): T[] {
  const kept: T[] = [];
  let used = 0;
  for (const message of newestFirst.slice(0, maxCount)) {
    if (kept.length > 0 && used + message.content.length > maxChars) break;
    kept.push(message);
    used += message.content.length;
  }
  return kept.reverse();
}
