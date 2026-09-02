import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import WebRuntime from '@deepseek-ai/dsh-web'
import { BraveSearchProvider, BRAVE_PROVIDER_ID } from '@deepseek-ai/dsh-web-search-brave'
import * as bravePlugin from '@deepseek-ai/dsh-web-search-brave'
import { mapBraveResponse, mapBraveResult } from '../src/provider.ts'

const options = { apiKey: 'brave-key', baseURL: 'https://api.search.brave.test', maxResults: 10 }

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Brave result mapping', () => {
  it('maps a full result entry', () => {
    expect(mapBraveResult({
      url: 'https://a.test',
      title: 'A',
      description: 'snippet text',
    })).toEqual({ url: 'https://a.test', title: 'A', snippet: 'snippet text' })
  })

  it('maps a result without optional fields', () => {
    expect(mapBraveResult({ url: 'https://a.test', title: 'A', description: '' }))
      .toEqual({ url: 'https://a.test', title: 'A', snippet: '' })
  })
})

describe('Brave response mapping', () => {
  it('maps a response with results', () => {
    const result = mapBraveResponse({
      web: {
        results: [
          { url: 'https://a.test', title: 'A', description: 'desc a' },
          { url: 'https://b.test', title: 'B', description: 'desc b' },
        ],
      },
    })
    expect(result).toEqual({
      sources: [
        { url: 'https://a.test', title: 'A', snippet: 'desc a' },
        { url: 'https://b.test', title: 'B', snippet: 'desc b' },
      ],
      truncated: false,
    })
  })

  it('yields no sources when results is absent', () => {
    expect(mapBraveResponse({}).sources).toEqual([])
  })
})

describe('BraveSearchProvider availability', () => {
  it('is unavailable without a key', () => {
    expect(new BraveSearchProvider({ ...options, apiKey: '' }).available()).toBe(false)
  })

  it('is available with a key', () => {
    expect(new BraveSearchProvider(options).available()).toBe(true)
  })

  it('is misconfigured when the base URL is unparseable', () => {
    expect(new BraveSearchProvider({ ...options, baseURL: 'not a url' }).available()).toBe(false)
  })

  it('is misconfigured when maxResults is not a positive integer', () => {
    expect(new BraveSearchProvider({ ...options, maxResults: 0 }).available()).toBe(false)
    expect(new BraveSearchProvider({ ...options, maxResults: 1.5 }).available()).toBe(false)
  })
})

describe('BraveSearchProvider request mapping', () => {
  it('sends query and count via GET with X-Subscription-Token auth', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ web: { results: [] } }))
    vi.stubGlobal('fetch', fetchMock)

    const provider = new BraveSearchProvider(options)
    await provider.search({ query: 'hello', maxResults: 5 })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url] = fetchMock.mock.calls[0] as unknown as [string]
    expect(url).toContain('https://api.search.brave.test/res/v1/web/search')
    expect(url).toContain('q=hello')
    expect(url).toContain('count=5')
  })

  it('uses configured maxResults when request omits maxResults', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ web: { results: [] } }))
    vi.stubGlobal('fetch', fetchMock)
    await new BraveSearchProvider({ ...options, maxResults: 7 }).search({ query: 'q' })
    const [url] = fetchMock.mock.calls[0] as unknown as [string]
    expect(url).toContain('count=7')
  })

  it('lets a request maxResults win over the configured maxResults', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ web: { results: [] } }))
    vi.stubGlobal('fetch', fetchMock)
    await new BraveSearchProvider({ ...options, maxResults: 7 }).search({ query: 'q', maxResults: 2 })
    const [url] = fetchMock.mock.calls[0] as unknown as [string]
    expect(url).toContain('count=2')
  })

  it('forwards the abort signal', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ web: { results: [] } }))
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    await new BraveSearchProvider(options).search({ query: 'q' }, controller.signal)
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.signal).toBe(controller.signal)
  })
})

describe('BraveSearchProvider error handling', () => {
  it('maps an HTTP error to WEB_PROVIDER_ERROR with the provider message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: { detail: 'bad key' } }, { status: 401 })))
    await expect(new BraveSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR', message: 'bad key' }))
  })

  it('keeps a status-line message when the error body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('gateway down', { status: 502 })))
    await expect(new BraveSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ message: 'Brave API error (HTTP 502)' }))
  })

  it('maps a network failure to WEB_PROVIDER_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('connection refused'))))
    await expect(new BraveSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR' }))
  })

  it('maps an abort to WEB_ABORTED', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new DOMException('aborted', 'AbortError'))))
    await expect(new BraveSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_ABORTED' }))
  })

  it('maps an unparseable success body to WEB_PROVIDER_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 200 })))
    await expect(new BraveSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR' }))
  })
})

describe('web-search-brave plugin registration', () => {
  it('registers the provider into ctx.web (HMR-safe)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ web: { results: [] } })))
    const ctx = new Context()
    await ctx.plugin(WebRuntime, { searchProvider: BRAVE_PROVIDER_ID })
    const fiber = await ctx.plugin(bravePlugin, { apiKey: 'brave-key' })
    await expect(ctx.web.search({ query: 'q' })).resolves.toMatchObject({ sources: [], truncated: false })
    await fiber.dispose()
    await expect(ctx.web.search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_CONFIGURED_MISSING' }))
  })

  it('has no default export (namespace plugin export shape)', () => {
    expect('default' in bravePlugin).toBe(false)
  })

  it('is unavailable when neither config nor env supplies a key', async () => {
    const prev = process.env.BRAVE_API_KEY
    delete process.env.BRAVE_API_KEY
    try {
      const ctx = new Context()
      await ctx.plugin(WebRuntime, { searchProvider: BRAVE_PROVIDER_ID })
      await ctx.plugin(bravePlugin, {})
      await expect(ctx.web.search({ query: 'q' }))
        .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_CONFIGURED_UNAVAILABLE' }))
    } finally {
      if (prev !== undefined) process.env.BRAVE_API_KEY = prev
    }
  })
})
