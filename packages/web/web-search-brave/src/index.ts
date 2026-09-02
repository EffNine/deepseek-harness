/**
 * Brave Search-backed `WebSearchProvider` plugin. It contributes to the
 * `ctx.web` registry without owning the service.
 *
 * @module @deepseek-ai/dsh-web-search-brave
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-web'
import { BraveSearchProvider, BRAVE_DEFAULT_BASE_URL, BRAVE_DEFAULT_MAX_RESULTS } from './provider.ts'

export {
  BRAVE_DEFAULT_BASE_URL,
  BRAVE_DEFAULT_MAX_RESULTS,
  BRAVE_PROVIDER_ID,
  BraveSearchProvider,
} from './provider.ts'
export type { BraveSearchProviderOptions } from './provider.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-search-brave'

/** The web seam this provider registers into. */
export const inject = ['web']

/** Plugin config (all optional — `apply` fills env-var and constant defaults). */
export interface Config {
  /** Brave Search API key. Falls back to `$BRAVE_API_KEY`. Empty → unavailable. */
  apiKey?: string
  /** Endpoint base. Defaults to the public API. */
  baseURL?: string
  /** Default result count. Defaults to 10. */
  maxResults?: number
}

export const Config: z<Config> = z.object({
  apiKey: z.string(),
  baseURL: z.string(),
  maxResults: z.number().step(1).min(1),
})

/** Register the Brave search provider with `ctx.web`. */
export function apply(ctx: Context, config: Config): void {
  ctx.web.registerSearchProvider(new BraveSearchProvider({
    apiKey: config.apiKey ?? '',
    baseURL: config.baseURL ?? BRAVE_DEFAULT_BASE_URL,
    maxResults: config.maxResults ?? BRAVE_DEFAULT_MAX_RESULTS,
  }))
}
