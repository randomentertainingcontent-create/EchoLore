// EchoLore shared types
// These mirror the Prisma models 1:1 and are used across client + server.

export type MessageRole = "user" | "assistant" | "system";

export interface Campaign {
  id: string;
  userId: string;
  title: string;
  worldDescription: string;
  userPersona: string;
  aiPersona: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export interface Message {
  id: string;
  campaignId: string;
  role: MessageRole;
  content: string;
  createdAt: string; // ISO
}

export interface WorldState {
  campaignId: string;
  stateJson: Record<string, unknown>;
  updatedAt: string;
}

// --- BYOK (Bring Your Own Key) ---

// EchoLore is OpenAI-only: one key handles chat (gpt-4o-mini default),
// lorebook updates (gpt-4o-mini), AND embeddings (text-embedding-3-small).
// This keeps the UX dead-simple and the RAG dimension consistent at 1536.
export interface ByokConfig {
  apiKey: string;
  chatModel: string;
  loreModel: string;   // cheap/fast model for the lorebook updater
  embedModel: string;  // text-embedding-3-small (1536 dims)
}

// Form payload for the New Campaign setup modal
export interface NewCampaignInput {
  title: string;
  worldDescription: string;
  userPersona: string;
  aiPersona: string;
  startingState?: Record<string, unknown>;
}

// --- RAG pipeline types (server-side) ---

export interface RetrievedMemory {
  id: string;
  messageId: string;
  content: string;
  similarity: number;
}

export interface CompiledPrompt {
  system: string;   // core directive + world + personas + world state + memories
  // ModelMessage-shaped ({role, content}) — passed directly to streamText
  messages: { role: MessageRole; content: string }[]; // working memory + user input
}
