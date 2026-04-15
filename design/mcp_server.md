### Domain → Collection Map

| Domain                               | Collection    | When to search                                             |
| ------------------------------------ | ------------- | ---------------------------------------------------------- |
| Roku SceneGraph / BrightScript / SDK | `roku_docs`   | Any Roku platform question                                 |
| YouTube Data API v3                  | `youtube_api` | Resources, methods, parameters, auth, error codes          |
| Scryfall API                         | `scryfall`    | Card search, sets, rulings, Magic: The Gathering data      |
| Python 3 standard library            | `python_docs` | stdlib modules, language reference                         |
| yt-dlp                               | `yt_dlp`      | Options, format strings, output templates, post-processing |
| FFmpeg                               | `ffmpeg`      | CLI flags, filters, codecs, formats, protocols             |
| Phaser 4 JavaScript game framework   | `phaser`      | Classes, events, functions, constants, namespaces, typedefs |

### How to Search

1. Identify the correct `collection` from the table above based on the domain.
2. Call `search` with a natural language query describing what you need.
3. Default `limit` is 5. Use 10 if initial results are not relevant.
4. If a search result contains relevant but incomplete content — call `get_page` with the `page_id` from the result to retrieve the full page.

#### Query formatting tips

The search engine uses **hybrid BM25 + vector search** with Reciprocal Rank Fusion. This means:
- **Exact terms score very high** — flag names, method names, API parameters, and option strings are matched directly by BM25
- **Natural language also works** — semantic vector search handles intent-based and conceptual queries well
- Both modes reinforce each other: a query like `nextPageToken pagination` gets BM25 credit for the exact term and vector credit for the concept

**Specific guidance:**

- **One concept per query.** Searches work best when focused on a single topic. Instead of "rulings oracle text legality", run three separate searches: "card rulings endpoint", "oracle text search syntax", "format legality filter".
- **Use the exact flag or method name when you know it.** `--write-info-json`, `nextPageToken`, `libx264`, `channels.list` — exact tokens score near-perfect (0.95+). Paraphrases like "save metadata to json" are weaker.
- **Include the operator or syntax token for syntax docs.** When searching Scryfall or yt-dlp format syntax, include the operator: `r: rarity filter`, `id: color identity`, `bv+ba format selection`, `t: card type`.
- **Combine exact + context for ambiguous flags.** `-c:v copy stream copy` is stronger than just `-c:v copy` because it adds semantic context for the vector side.
- **Use natural language for conceptual topics.** "hardware acceleration decoding", "audio loudness normalization", "SceneGraph animation nodes" — descriptive phrases work well when there's no single canonical term.
- **Increase limit to 10 if top results miss.** Some topics span multiple pages (e.g., ffmpeg codec options, Roku threading model). Broader retrieval catches them.

#### When scores may be lower (expected)

Some query types reliably score below 0.70 — this is expected, not a server issue:
- **Cross-cutting concerns**: authentication, error handling, general config — these topics appear across many pages with no single authoritative one
- **Python dunder methods** (`__init__`, `__enter__`): minimal semantic content in the page itself; use `get_page` on `reference/datamodel.md` directly
- **Highly abstract patterns**: "decorator pattern", "dependency injection" — search for the Python-specific term instead (`@functools.wraps`, `@contextmanager`)

### Rules

- **Always search before answering** any question about the domains above. Do not rely on training data or web search for these domains.
- **If the MCP server is unreachable**, tell the user: "The documentation server at 192.168.77.29 is unreachable. I cannot provide a reliable answer for this domain without it." Do not guess from training data.
- **If search returns no results**, say so explicitly — do not fall back to training data.
- **Cite the source URL** from search results when referencing documentation.
- **If the user hasn't specified a collection** and the domain is ambiguous, call `list_collections` to see what's available, then pick the most relevant one.