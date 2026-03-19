export interface ProviderOption {
  value: string;
  label: string;
  hint: string;
}

export interface ModelOption {
  value: string;
  label: string;
}

export const SUPPORTED_PROVIDERS: ProviderOption[] = [
  { value: "anthropic", label: "Anthropic", hint: "Claude 4, 3.5 Sonnet, Opus, Haiku" },
  { value: "openai", label: "OpenAI", hint: "GPT-4o, o1, o3-mini" },
  { value: "google", label: "Google", hint: "Gemini 3.1 Pro-preview, 3 Flash-preview" },
  { value: "mistral", label: "Mistral", hint: "Mistral Large, Codestral" },
  { value: "groq", label: "Groq", hint: "Llama 3.1 70B, Mixtral" },
  { value: "deepseek", label: "DeepSeek", hint: "DeepSeek Chat, Reasoner" },
  { value: "fireworks", label: "Fireworks AI", hint: "Llama 3.1 70B Instruct" },
  { value: "together", label: "Together AI", hint: "Llama 3.1 Turbo" },
  { value: "ollama", label: "Ollama (Local)", hint: "No API key needed" },
];

export const PROVIDER_MODELS: Record<string, ModelOption[]> = {
  anthropic: [
    { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
    { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
    { value: "claude-3-opus-20240229", label: "Claude 3 Opus" },
    { value: "claude-3-haiku-20240307", label: "Claude 3 Haiku" },
  ],
  openai: [
    { value: "gpt-4o", label: "GPT-4o" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini" },
    { value: "o1", label: "o1" },
    { value: "o3-mini", label: "o3-mini" },
  ],
  google: [
    { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro Preview" },
    { value: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview" },
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
    { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
  ],
  mistral: [
    { value: "mistral-large-latest", label: "Mistral Large" },
    { value: "codestral-latest", label: "Codestral" },
    { value: "mistral-small-latest", label: "Mistral Small" },
  ],
  groq: [
    { value: "llama-3.1-70b-versatile", label: "Llama 3.1 70B" },
    { value: "mixtral-8x7b-32768", label: "Mixtral 8x7B" },
  ],
  deepseek: [
    { value: "deepseek-chat", label: "DeepSeek Chat" },
    { value: "deepseek-reasoner", label: "DeepSeek Reasoner" },
  ],
  fireworks: [
    {
      value: "accounts/fireworks/models/llama-v3p1-70b-instruct",
      label: "Llama 3.1 70B Instruct",
    },
  ],
  together: [
    {
      value: "meta-llama/Llama-3.1-70B-Instruct-Turbo",
      label: "Llama 3.1 70B Turbo",
    },
  ],
  ollama: [
    { value: "llama3", label: "Llama 3" },
    { value: "codellama", label: "Code Llama" },
    { value: "mistral", label: "Mistral" },
  ],
};
