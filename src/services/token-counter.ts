import { encoding_for_model } from 'tiktoken';

export class TokenCounter {
  private encoder = encoding_for_model('gpt-4');

  count(text: string): number {
    try {
      return this.encoder.encode(text).length;
    } catch (error) {
      // Fallback to rough estimate
      return Math.ceil(text.length / 4);
    }
  }

  async truncateToLimit(data: any, maxTokens: number): Promise<any> {
    const serialized = JSON.stringify(data, null, 2);
    const currentTokens = this.count(serialized);
    
    if (currentTokens <= maxTokens) {
      return data;
    }

    // If it's a search results object, truncate the results array
    if (data.results && Array.isArray(data.results)) {
      const truncated = { ...data };
      const itemsToKeep = Math.floor(data.results.length * (maxTokens / currentTokens));
      truncated.results = data.results.slice(0, Math.max(1, itemsToKeep));
      truncated.truncated = true;
      truncated.originalCount = data.results.length;
      return truncated;
    }

    // If it's a page object, truncate content
    if (data.content && typeof data.content === 'string') {
      const truncated = { ...data };
      const targetLength = Math.floor(data.content.length * (maxTokens / currentTokens));
      truncated.content = data.content.substring(0, Math.max(100, targetLength)) + '... [truncated]';
      truncated.truncated = true;
      return truncated;
    }

    // Generic truncation for other objects
    const truncated = { ...data };
    const keys = Object.keys(data);
    const keysToKeep = Math.floor(keys.length * (maxTokens / currentTokens));
    
    for (let i = keysToKeep; i < keys.length; i++) {
      delete truncated[keys[i]];
    }
    
    truncated.truncated = true;
    return truncated;
  }
}