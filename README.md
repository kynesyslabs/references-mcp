# Demos SDK Documentation MCP Server

A highly efficient MCP (Model Context Protocol) server that provides access to the complete Demos SDK API documentation from the [demosdk-api-ref](https://github.com/kynesyslabs/demosdk-api-ref) Git repository.

## Features

- 🚀 **High Performance**: Git-based local file system with intelligent caching
- 📄 **Smart Pagination**: Token-aware responses (max 25k tokens)
- 🔍 **Full-Text Search**: Indexed search across all documentation
- 🎯 **LLM Optimized**: Clean, structured responses for AI consumption
- ⚡ **StreamableHTTP Compatible**: Works with modern MCP clients
- 🔄 **Auto-Updates**: Git-based change detection and cache invalidation
- 📚 **Complete Coverage**: All TypeDoc pages (classes, interfaces, functions, etc.)

## Installation

```bash
npm install
npm run build
```

## Usage

### 1. Clone Documentation

First, clone and cache the documentation repository:

```bash
npm run clone-docs
```

### 2. Start the MCP Server

**StreamableHTTP mode (recommended):**
```bash
npm run start:http
```

**Stdio mode:**
```bash
npm start
```

### 3. Docker (Recommended)

For production use with automatic restarts and log management:

```bash
# Build and start
npm run docker:up

# View logs
npm run docker:logs

# Stop
npm run docker:down

# Restart
npm run docker:restart
```

The Docker setup includes:
- ✅ Auto-updates documentation on startup
- ✅ Periodic updates every 6 hours via cron
- ✅ Health checks and auto-restart
- ✅ Persistent data volumes
- ✅ Log file mounting

### 4. Connect via MCP Client

The server provides these tools:

#### `search_docs`
Search the documentation with pagination support.

**Parameters:**
- `query` (string): Search query
- `limit` (number, optional): Results per page (default: 10)
- `offset` (number, optional): Pagination offset (default: 0)

**Example:**
```json
{
  "name": "search_docs",
  "arguments": {
    "query": "Demos class",
    "limit": 5,
    "offset": 0
  }
}
```

#### `get_page`
Get a specific documentation page by path.

**Parameters:**
- `path` (string): Page path (e.g., "classes/websdk.Demos.html")
- `section` (string, optional): Specific section within the page

#### `list_modules`
List all available modules in the documentation.

**Parameters:**
- `limit` (number, optional): Results per page (default: 50)
- `offset` (number, optional): Pagination offset (default: 0)

#### `get_stats`
Get documentation statistics and cache information.

#### `update_docs`
Update documentation from the Git repository (pulls latest changes).

## Token Management

The server automatically manages response sizes to stay under 25k tokens per response:
- Responses are automatically truncated if needed
- Search results are paginated intelligently
- Content is optimized for LLM consumption

## Architecture

- **GitDocumentationService**: Git-based documentation management with intelligent caching
- **TokenCounter**: Manages token limits using tiktoken
- **Smart Caching**: Git commit-based cache invalidation
- **Search Index**: In-memory full-text search index
- **Local Repository**: Complete TypeDoc documentation cloned locally

## Development

```bash
# Development mode with auto-reload (stdio)
npm run dev

# Development mode with StreamableHTTP
npm run dev:http

# Build for production
npm run build

# Update documentation (git pull + cache refresh)
npm run update-docs
```

## Cache Details

- Repository cloned to `docs-repo/` directory
- Documentation cached in `.cache/docs.json` with metadata in `.cache/meta.json`
- Cache automatically invalidated when Git commit changes
- All TypeDoc pages discovered and indexed (278+ pages)
- HTML content extracted and cleaned for LLM consumption
- Full coverage: classes, interfaces, functions, types, enums, variables

## Performance

The Git-based approach provides several advantages:
- **Complete Coverage**: 278 pages vs 16 with web scraping
- **Faster Access**: Local file system instead of HTTP requests
- **Smart Caching**: Only rebuilds when repository changes
- **Reliable**: No network dependency after initial clone