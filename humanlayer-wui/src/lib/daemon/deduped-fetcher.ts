/**
 * DedupedFetcher prevents duplicate concurrent requests for the same resource.
 * If a request is already in flight, returns the existing promise instead of
 * starting a new request.
 */
export class DedupedFetcher {
  private pending = new Map<string, Promise<any>>()

  /**
   * Fetch with deduplication. If a request with the same key is in flight,
   * returns that promise instead of starting a new request.
   *
   * @param key Unique identifier for the request (e.g., "conversation:sess_123")
   * @param fetcher Function that performs the actual fetch
   * @returns Promise resolving to the fetch result
   */
  async fetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    // If request already in flight, return existing promise
    const existing = this.pending.get(key)
    if (existing) {
      return existing
    }

    // Start new request and track it
    const promise = fetcher().finally(() => {
      this.pending.delete(key)
    })

    this.pending.set(key, promise)
    return promise
  }

  /**
   * Check if a request is currently in flight
   */
  hasPending(key: string): boolean {
    return this.pending.has(key)
  }

  /**
   * Clear all pending requests (useful for cleanup)
   */
  clear(): void {
    this.pending.clear()
  }
}

// Singleton instance for conversation fetching
export const conversationFetcher = new DedupedFetcher()
