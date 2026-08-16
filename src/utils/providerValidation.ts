export type Provider = "openai" | "claude" | "ollama" | "groq" | "together";
export type FallbackProvider = "none" | Provider;

interface ProviderValidationInput {
  provider: Provider;
  openAiApiKey: string;
  claudeApiKey: string;
  groqApiKey: string;
  togetherApiKey: string;
  ollamaBaseUrl: string;
  groqBaseUrl: string;
  togetherBaseUrl: string;
  model: string;
  fallbackProvider: FallbackProvider;
  fallbackModel: string;
  configuredProviders?: Partial<Record<Provider, boolean>>;
}

function hasCredential(
  provider: Provider,
  inlineValue: string,
  configuredProviders?: Partial<Record<Provider, boolean>>,
): boolean {
  return Boolean(inlineValue.trim()) || configuredProviders?.[provider] === true;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function validatePrimaryProvider(input: ProviderValidationInput): string[] {
  const issues: string[] = [];

  if (!input.model.trim()) {
    issues.push("Primary model is required.");
  }

  if (input.provider === "openai") {
    const apiKey = input.openAiApiKey.trim();
    if (!hasCredential("openai", apiKey, input.configuredProviders)) {
      issues.push("OpenAI API key is required.");
    } else if (!apiKey.startsWith("sk-")) {
      if (apiKey) {
        issues.push("OpenAI API key should start with 'sk-'.");
      }
    }
  }

  if (input.provider === "claude") {
    const apiKey = input.claudeApiKey.trim();
    if (!hasCredential("claude", apiKey, input.configuredProviders)) {
      issues.push("Claude API key is required.");
    } else if (!apiKey.startsWith("sk-ant-")) {
      if (apiKey) {
        issues.push("Claude API key should start with 'sk-ant-'.");
      }
    }
  }

  if (input.provider === "ollama") {
    const baseUrl = input.ollamaBaseUrl.trim();
    if (!baseUrl) {
      issues.push("Ollama URL is required.");
    } else if (!isValidHttpUrl(baseUrl)) {
      issues.push("Ollama URL must be a valid http/https URL.");
    }
  }

  if (input.provider === "groq") {
    const apiKey = input.groqApiKey.trim();
    if (!hasCredential("groq", apiKey, input.configuredProviders)) {
      issues.push("Groq API key is required.");
    }

    const baseUrl = input.groqBaseUrl.trim();
    if (!baseUrl) {
      issues.push("Groq URL is required.");
    } else if (!isValidHttpUrl(baseUrl)) {
      issues.push("Groq URL must be a valid http/https URL.");
    }
  }

  if (input.provider === "together") {
    const apiKey = input.togetherApiKey.trim();
    if (!hasCredential("together", apiKey, input.configuredProviders)) {
      issues.push("Together API key is required.");
    }

    const baseUrl = input.togetherBaseUrl.trim();
    if (!baseUrl) {
      issues.push("Together URL is required.");
    } else if (!isValidHttpUrl(baseUrl)) {
      issues.push("Together URL must be a valid http/https URL.");
    }
  }

  return issues;
}

function validateFallbackProvider(input: ProviderValidationInput): string[] {
  const issues: string[] = [];

  if (input.fallbackProvider === "none") {
    return issues;
  }

  if (input.fallbackProvider === input.provider) {
    issues.push("Fallback provider must be different from primary provider.");
  }

  if (!input.fallbackModel.trim()) {
    issues.push("Fallback model is required when fallback provider is enabled.");
  }

  if (input.fallbackProvider === "openai") {
    const apiKey = input.openAiApiKey.trim();
    if (!hasCredential("openai", apiKey, input.configuredProviders)) {
      issues.push("OpenAI API key is required for OpenAI fallback.");
    }
  }

  if (input.fallbackProvider === "claude") {
    const apiKey = input.claudeApiKey.trim();
    if (!hasCredential("claude", apiKey, input.configuredProviders)) {
      issues.push("Claude API key is required for Claude fallback.");
    }
  }

  if (input.fallbackProvider === "ollama") {
    const baseUrl = input.ollamaBaseUrl.trim();
    if (!baseUrl) {
      issues.push("Ollama URL is required for Ollama fallback.");
    } else if (!isValidHttpUrl(baseUrl)) {
      issues.push("Ollama URL must be a valid http/https URL.");
    }
  }

  if (input.fallbackProvider === "groq") {
    const apiKey = input.groqApiKey.trim();
    if (!hasCredential("groq", apiKey, input.configuredProviders)) {
      issues.push("Groq API key is required for Groq fallback.");
    }

    const baseUrl = input.groqBaseUrl.trim();
    if (!baseUrl) {
      issues.push("Groq URL is required for Groq fallback.");
    } else if (!isValidHttpUrl(baseUrl)) {
      issues.push("Groq URL must be a valid http/https URL.");
    }
  }

  if (input.fallbackProvider === "together") {
    const apiKey = input.togetherApiKey.trim();
    if (!hasCredential("together", apiKey, input.configuredProviders)) {
      issues.push("Together API key is required for Together fallback.");
    }

    const baseUrl = input.togetherBaseUrl.trim();
    if (!baseUrl) {
      issues.push("Together URL is required for Together fallback.");
    } else if (!isValidHttpUrl(baseUrl)) {
      issues.push("Together URL must be a valid http/https URL.");
    }
  }

  return issues;
}

export function validateProviderSettings(input: ProviderValidationInput): string[] {
  return [...validatePrimaryProvider(input), ...validateFallbackProvider(input)];
}
