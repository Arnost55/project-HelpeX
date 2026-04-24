export function estimateTokens(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }

  return Math.ceil(trimmed.length / 4);
}

export function estimateConversationTokens(messages: Array<{ content: string }>): number {
  return messages.reduce((total, message) => total + estimateTokens(message.content), 0);
}
