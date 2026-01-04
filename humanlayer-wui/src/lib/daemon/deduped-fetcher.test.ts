import { describe, it, expect, beforeEach } from 'bun:test'
import { DedupedFetcher } from './deduped-fetcher'

describe('DedupedFetcher', () => {
  let fetcher: DedupedFetcher

  beforeEach(() => {
    fetcher = new DedupedFetcher()
  })

  it('should deduplicate concurrent requests with the same key', async () => {
    let callCount = 0
    const fetcherFn = async () => {
      callCount++
      await new Promise(resolve => setTimeout(resolve, 50))
      return 'result'
    }

    // Start two concurrent requests with the same key
    const promise1 = fetcher.fetch('key1', fetcherFn)
    const promise2 = fetcher.fetch('key1', fetcherFn)

    // Wait for both
    const [result1, result2] = await Promise.all([promise1, promise2])

    // Both should return the same result
    expect(result1).toBe('result')
    expect(result2).toBe('result')

    // The fetcher function should only be called once (deduplication works)
    expect(callCount).toBe(1)
  })

  it('should make separate requests for different keys', async () => {
    let callCount = 0
    const fetcherFn = async () => {
      callCount++
      return `result-${callCount}`
    }

    const result1 = await fetcher.fetch('key1', fetcherFn)
    const result2 = await fetcher.fetch('key2', fetcherFn)

    expect(result1).toBe('result-1')
    expect(result2).toBe('result-2')
    expect(callCount).toBe(2)
  })

  it('should allow new request after previous completes', async () => {
    let callCount = 0
    const fetcherFn = async () => {
      callCount++
      return `result-${callCount}`
    }

    // First request
    const result1 = await fetcher.fetch('key1', fetcherFn)
    expect(result1).toBe('result-1')

    // Second request with same key (should make new request since first completed)
    const result2 = await fetcher.fetch('key1', fetcherFn)
    expect(result2).toBe('result-2')

    expect(callCount).toBe(2)
  })

  it('should report pending status correctly', async () => {
    const fetcherFn = async () => {
      await new Promise(resolve => setTimeout(resolve, 50))
      return 'result'
    }

    expect(fetcher.hasPending('key1')).toBe(false)

    const promise = fetcher.fetch('key1', fetcherFn)

    expect(fetcher.hasPending('key1')).toBe(true)

    await promise

    expect(fetcher.hasPending('key1')).toBe(false)
  })

  it('should clear all pending requests', async () => {
    const fetcherFn = async () => {
      await new Promise(resolve => setTimeout(resolve, 100))
      return 'result'
    }

    fetcher.fetch('key1', fetcherFn)
    fetcher.fetch('key2', fetcherFn)

    expect(fetcher.hasPending('key1')).toBe(true)
    expect(fetcher.hasPending('key2')).toBe(true)

    fetcher.clear()

    expect(fetcher.hasPending('key1')).toBe(false)
    expect(fetcher.hasPending('key2')).toBe(false)
  })

  it('should handle errors and clean up pending state', async () => {
    const error = new Error('Test error')
    const fetcherFn = async () => {
      throw error
    }

    expect(fetcher.hasPending('key1')).toBe(false)

    const promise = fetcher.fetch('key1', fetcherFn)

    expect(fetcher.hasPending('key1')).toBe(true)

    await expect(promise).rejects.toThrow('Test error')

    // Pending should be cleared after error
    expect(fetcher.hasPending('key1')).toBe(false)
  })
})
