import { describe, expect, it } from 'vitest'
import { safeJsonParse } from './safeJsonParse'

describe('safeJsonParse', () => {
  it('parses valid JSON with a passing guard', () => {
    const result = safeJsonParse(
      '{"count":42}',
      { count: 0 },
      (v): v is { count: number } => typeof v === 'object' && v !== null && 'count' in v
    )
    expect(result).toEqual({ count: 42 })
  })

  it('returns fallback when guard rejects the parsed value', () => {
    const result = safeJsonParse(
      '"not an object"',
      { count: 0 },
      (v): v is { count: number } => typeof v === 'object' && v !== null && 'count' in v
    )
    expect(result).toEqual({ count: 0 })
  })

  it('returns fallback on malformed JSON (with guard)', () => {
    const result = safeJsonParse(
      'not json at all',
      [] as number[],
      (v): v is number[] => Array.isArray(v)
    )
    expect(result).toEqual([])
  })

  it('parses valid JSON without a guard (trusted shape)', () => {
    const result = safeJsonParse<number[]>('[1,2,3]', [])
    expect(result).toEqual([1, 2, 3])
  })

  it('returns fallback on malformed JSON without a guard', () => {
    const result = safeJsonParse<string>('{{invalid', 'default')
    expect(result).toBe('default')
  })

  it('returns fallback for empty string input', () => {
    const result = safeJsonParse('', 'fallback')
    expect(result).toBe('fallback')
  })
})
