/**
 * Brave Search-backed `WebSearchProvider` plugin. It calls the Brave Search API
 * (`GET /res/v1/web/search`) with `X-Subscription-Token` authentication, maps
 * the `web.results[]` envelope to normalized `WebSearchSource` items, and
 * registers under the stable id `brave`.
 *
 * @module @deepseek-ai/dsh-web-search-brave/provider
 */

import { WebError } from '@deepseek-ai/dsh-web'
import type {
  WebSearchProvider,
  WebSearchRequest,
  WebSearchResult,
  WebSearchSource,
} from '@deepseek-ai/dsh-web'

/** Stable id this provider registers under. */
export const BRAVE_PROVIDER_ID = 'brave'

/** Default Brave Search endpoint base. `/res/v1/web/search` is appended. */
export const BRAVE_DEFAULT_BASE_URL = 'https://api.search.brave.com'

/** Default number of results per search. */
export const BRAVE_DEFAULT_MAX_RESULTS = 10

/** Attribution header sent on every request. */
const USER_AGENT = 'deepseek-harness/0.0.1'

/**
 * Normalized Brave API error envelope.
 */
export interface BraveErrorResponse {
  error?: {
    code?: string
    message?: string
    detail?: string
  }
}

/**
 * Individual result item from Brave Search API.
 */
export interface BraveResult {
  title: string
  url: string
  description: string
  meta_url?: {
    sanitized_url?: string
    domain?: string
  }
  meta_content_type?: string
  age?: string
}

/**
 * Parsed Brave Search API response.
 */
export interface BraveSearchResponse {
  web?: {
    results?: BraveResult[]
    contacts?: unknown
    facts?: unknown
  }
  queries?: {
    final?: string
    request?: string[]
  }
  metadata?: {
    req_id?: string
  }
}

/**
 * Map one Brave result to a normalized source.
 *
 * @param result - one entry of Brave's `web.results[]`.
 * @returns the normalized source.
 */
export function mapBraveResult(result: BraveResult): WebSearchSource {
  return {
    url: result.url,
    title: result.title,
    snippet: result.description,
  }
}

/**
 * Map a Brave response envelope to a normalized search result.
 *
 * @param response - the parsed `GET /res/v1/web/search` response body.
 * @returns the normalized result.
 */
export function mapBraveResponse(response: BraveSearchResponse): WebSearchResult {
  const sources = (response.web?.results ?? [])
    .map(mapBraveResult)
  return { sources, truncated: false }
}

/** Resolved provider options (the plugin's `apply` supplies env-var defaults). */
export interface BraveSearchProviderOptions {
  /** Brave Search API key (`X-Subscription-Token` header). */
  apiKey: string
  /** Endpoint base; `/res/v1/web/search` is appended. */
  baseURL: string
  /** Default result count when a request carries no `maxResults`. */
  maxResults: number
}

/**
 * The Brave Search-backed provider; HTTP redirects fail as `WEB_PROVIDER_ERROR`.
 */
export class BraveSearchProvider implements WebSearchProvider {
  readonly id = BRAVE_PROVIDER_ID

  constructor(private readonly options: BraveSearchProviderOptions) {}

  available(): boolean {
    return this.options.apiKey.length > 0
      && URL.canParse(this.options.baseURL)
      && isPositiveInteger(this.options.maxResults)
  }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    const count = request.maxResults ?? this.options.maxResults
    const params = new URLSearchParams({
      q: request.query,
      count: String(count),
    })
    const endpoint = `${this.options.baseURL}/res/v1/web/search?${params}`

    let response: Response
    try {
      response = await fetch(endpoint, {
        method: 'GET',
        redirect: 'error',
        headers: {
          'X-Subscription-Token': this.options.apiKey,
          'Accept': 'application/json',
          'User-Agent': USER_AGENT,
        },
        ...signal !== undefined ? { signal } : {},
      })
    } catch (error: unknown) {
      if (isAbortError(error)) throw new WebError('Brave search aborted', 'WEB_ABORTED', { cause: error })
      throw new WebError(`Brave search request failed: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }

    if (!response.ok) {
      const status = response.status
      let message = `Brave API error (HTTP ${status})`
      try {
        const parsed = await response.json() as BraveErrorResponse
        const detail = parsed.error?.detail ?? parsed.error?.message
        if (detail !== undefined && detail.length > 0) message = detail
      } catch {
        // Malformed/non-JSON error body — the HTTP status is already captured above.
      }
      throw new WebError(message, 'WEB_PROVIDER_ERROR')
    }

    try {
      const payload = await response.json() as BraveSearchResponse
      return mapBraveResponse(payload)
    } catch (error: unknown) {
      if (isAbortError(error)) throw new WebError('Brave search aborted', 'WEB_ABORTED', { cause: error })
      throw new WebError(`Brave returned an unprocessable response body: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
  }
}

/** True for a request limit that can be sent to Brave (a positive whole number). */
function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0
}

/** True for a fetch/`AbortSignal` abort, surfaced as `WEB_ABORTED`. */
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}
