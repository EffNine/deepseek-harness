# Brave Search Provider

A [`WebSearchProvider`] backed by the [Brave Search API]. It maps results to the normalized harness `WebSearchSource` shape and registers under the stable id `brave`.

## Configuration

| Setting | Env var | Default |
|---|---|---|
| API key | `BRAVE_API_KEY` | — (required) |
| Endpoint base | `BRAVE_SEARCH_BASE_URL` | `https://api.search.brave.com` |
| Max results | `maxResults` | 10 |

## Example

```yaml
- id: web-search-brave
  name: '@deepseek-ai/dsh-web-search-brave'
  config:
    apiKey: your-brave-api-key
    maxResults: 10
```

Or via environment:

```bash
export BRAVE_API_KEY=bsaX...
```

## API

The provider calls `GET /res/v1/web/search` with the query, parsing the `web.results[]` envelope. Each result is mapped to a `WebSearchSource` with `url`, `title`, and `description` as `snippet`. Pagination is not exposed — each harness call is one HTTP request.

[Brave Search API]: https://api.search.brave.com/app/documentation/web-search/get-started
[`WebSearchProvider`]: https://github.com/deepseek-ai/deepseek-harness/tree/main/packages/web/web#readme
