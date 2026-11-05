// EchoLore shared types
// Used across client + server.

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

export interface ByokConfig {
  openrouterKey: string;
  chatModel: string;
  loreModel: string;
  embedModel: string;
  embedDimensions: number;
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
  system: string;
  // ModelMessage-shaped ({role, content}) — passed directly to streamText
  messages: { role: MessageRole; content: string }[];
}

// --- OpenRouter model catalogue (GET /api/models) ---

export interface ModelSummary {
  id: string;
  name: string;
  contextLength: number | null;
  promptPrice: number | null; // USD per 1M tokens
  completionPrice: number | null; // USD per 1M tokens
  free: boolean;
}

// --- Storytelling preferences ---

export type ResponseLength = "short" | "medium" | "long";
