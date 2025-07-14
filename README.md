# DemoSDK API Reference MCP Server

A Model Context Protocol (MCP) server for efficient search and retrieval of TypeDoc-generated documentation for the `@kynesyslabs/demosdk` package.

**Supports both local (stdio) and remote (SSE/HTTP) MCP connections.**

## Quick Start

```bash
# Install and build
npm install && npm run build

# Local MCP (Claude Code)
npm start

# Remote MCP (team/web access)  
npm run start:http

# Test everything works
npm run test-mcp-client
```

## Features

- **Dual Transport Support**: stdio (local) and SSE (remote) transports
- **Efficient Search**: Full-text search with relevance scoring and fuzzy matching
- **Pagination**: Smart pagination that respects MCP response limits (~20,000 characters)
- **Multiple Search Types**: 
  - General documentation search
  - Code-specific search
  - Module-filtered search
  - Type-specific search
- **Character Limit Awareness**: Automatically truncates results to stay within MCP limits
- **Real-time Updates**: File watching for automatic documentation updates
- **Remote Access**: Full SSE/HTTP support for remote MCP connections
- **Session Management**: Multi-client support with automatic cleanup
- **Optimized for LLMs**: Designed specifically for Claude Code and similar tools

## Installation

```bash
npm install
npm run build
```

## Usage

### Update Documentation

```bash
npm run update-docs          # Pull latest docs
npm run update-and-rebuild   # Pull docs and rebuild server
```

### Start Server

```bash
npm start                    # Production (stdio transport)
npm run start:http           # SSE/HTTP transport for remote access
npm run dev                  # Development (stdio transport)
```

#### Transport Options

- **stdio** (default): Standard MCP over stdin/stdout - works with Claude Code
- **SSE/HTTP**: Full Server-Sent Events transport for remote MCP connections

### Test Server

```bash
npm run inspect             # Test stdio transport
npm run test-sse            # Test SSE endpoints  
npm run test-mcp-client     # Test full MCP over SSE
npm run test-search         # Test search functionality
```

### MCP Tools

The server provides the following tools:

#### `fetch_demosdk_api_ref_docs`
Get overview of entire documentation.

#### `search_demosdk_api_ref_docs`
Search documentation with advanced options:
- `query` (required): Search query
- `limit` (optional): Max results (default: 10, max: 50)
- `offset` (optional): Pagination offset (default: 0)
- `type` (optional): Filter by page type (class, function, interface, etc.)
- `moduleName` (optional): Filter by module name
- `fuzzyMatch` (optional): Enable fuzzy matching (default: false)

**Response includes:**
- Pagination info with `hasMore` indicator
- Character usage statistics
- Relevance scores
- Snippets with context

#### `search_demosdk_api_ref_code`
Search specifically for code blocks:
- `query` (required): Search query
- `page` (optional): Page number (default: 1)

**Features:**
- Filters results to only code-containing pages
- Truncates large code blocks to fit response limits
- Includes context and metadata

#### `fetch_generic_url_content`
Get specific page content:
- `path` (required): Relative path (e.g., "classes/websdk.Demos.html")

#### `get_modules`
List all available modules.

#### `get_stats`
Get documentation statistics.

## SSE/HTTP Remote Access

### Server Endpoints

When running with `npm run start:http`, the server provides:

```bash
GET  http://localhost:3000/             # Server information
GET  http://localhost:3000/health       # Health check and status  
GET  http://localhost:3000/message      # Establish SSE connection
POST http://localhost:3000/message?sessionId=X  # Send MCP messages
```

### MCP Client Connection

To connect an MCP client to the SSE server:

1. **Establish SSE Connection**:
   ```bash
   curl -N http://localhost:3000/message
   ```
   
2. **Read Session ID from SSE stream**:
   ```
   event: endpoint
   data: /message?sessionId=abc-123-def
   ```

3. **Send MCP Messages**:
   ```bash
   curl -X POST http://localhost:3000/message?sessionId=abc-123-def \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
   ```

4. **Receive Responses via SSE**:
   ```
   event: message  
   data: {"jsonrpc":"2.0","id":1,"result":{"tools":[...]}}
   ```

### Health Monitoring

```bash
# Check server status
curl http://localhost:3000/health

# Response includes:
{
  "status": "healthy",
  "initialized": true, 
  "pages": 264,
  "activeSessions": 2,
  "transport": "SSE"
}
```

## Architecture

### Components

1. **TypeDocParser**: Parses HTML files from TypeDoc output
2. **DocumentSearcher**: Provides search and indexing capabilities
3. **DemoSDKMCPServer**: MCP server implementation with tools

### Search Features

- **TF-IDF Scoring**: Relevance-based ranking
- **Multi-field Search**: Title, content, code, metadata
- **Fuzzy Matching**: Typo tolerance
- **Smart Truncation**: Respects MCP character limits
- **Context Preservation**: Maintains code context and snippets

### Pagination

The server implements smart pagination:
- Monitors character usage in real-time
- Stops adding results before hitting the limit
- Provides clear `hasMore` indicators
- Includes usage statistics in responses

## Configuration

Edit `src/server.ts` to adjust:
- `MAX_RESPONSE_CHARS`: Response size limit (default: 20,000)
- Page sizes for different search types
- Index patterns and exclusions

## Development

```bash
npm run typecheck    # Type checking
npm run lint         # Linting
npm run test         # Run tests
```

## File Structure

```
src/
├── types.ts         # TypeScript interfaces
├── parser.ts        # HTML parsing and file processing
├── search.ts        # Search engine and indexing
├── server.ts        # MCP server implementation (stdio)
├── index.ts         # Entry point (stdio transport)
└── index-http.ts    # SSE/HTTP transport server

scripts/
├── update-docs.sh   # Documentation update script
├── inspect.js       # Test stdio transport
├── test-sse.js      # Test SSE endpoints
├── test-mcp-client.js # Test MCP over SSE
└── test-search.js   # Test search functionality

demosdk-api-ref/     # TypeDoc generated documentation
├── classes/         # Class documentation
├── interfaces/      # Interface documentation
├── functions/       # Function documentation
├── enums/          # Enum documentation
├── types/          # Type documentation
├── variables/      # Variable documentation
└── modules/        # Module documentation
```

## Performance

- **Startup**: ~1.5s to parse 264 pages
- **Search**: Sub-millisecond response times
- **Memory**: Efficient in-memory indexing
- **Response Size**: Automatically limited to ~20KB

## Integration

### Local Integration (stdio)
Perfect for use with:
- **Claude Code**: Direct MCP integration
- **Other MCP CLI tools**: Standard stdio transport
- **Local development**: Fast, direct access

### Remote Integration (SSE/HTTP)  
Perfect for use with:
- **Remote MCP clients**: Full HTTP/SSE support
- **Web applications**: Browser-compatible endpoints
- **Multi-user environments**: Session management
- **Microservices**: HTTP API integration
- **Development teams**: Shared documentation server

### Port Configuration

```bash
# Default port (3000)
npm run start:http

# Custom port via environment variable
PORT=8080 npm run start:http
MCP_PORT=8080 npm run start:http

# Using .env file
cp .env.example .env
# Edit .env file with your settings
npm run start:http
```

### Usage Examples

```bash
# Local development with Claude Code
npm start

# Remote team server  
npm run start:http
# Team members connect to: http://your-server:3000/message

# Custom port
PORT=8080 npm run start:http
# Connect to: http://your-server:8080/message

# Health monitoring in production
curl http://your-server:3000/health

# Direct API access
curl -X POST http://your-server:3000/message?sessionId=X \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_demosdk_api_ref_docs","arguments":{"query":"Demos"}}}'
```

The server is optimized for the keyword-heavy search patterns common in LLM interactions and supports both local and remote deployment scenarios.

## Production Deployment

### Nginx Reverse Proxy

The server works perfectly behind nginx. A complete configuration is provided in `nginx.conf`:

```bash
# Copy and customize the nginx config
cp nginx.conf /etc/nginx/sites-available/mcp-server
ln -s /etc/nginx/sites-available/mcp-server /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# Run MCP server behind nginx
PORT=3000 npm run start:http
```

**Key nginx features:**
- ✅ SSE streaming support (`proxy_buffering off`)
- ✅ WebSocket upgrade handling
- ✅ CORS headers for browser access
- ✅ SSL/HTTPS configuration ready
- ✅ Health check endpoint proxying
- ✅ Production security headers

### Docker Deployment

```bash
# Build and run with Docker
docker build -t mcp-server .
docker run -p 3000:3000 mcp-server

# Or use Docker Compose (includes nginx)
docker-compose up -d

# Custom port with Docker Compose
MCP_PORT=8080 docker-compose up -d
```

**Docker features:**
- ✅ Multi-stage build for optimal size
- ✅ Non-root user for security
- ✅ Health checks built-in
- ✅ Volume mounting for documentation updates
- ✅ nginx proxy container included

### Environment Variables

```bash
PORT=3000          # Server port (default: 3000)
MCP_PORT=3000      # Alternative port variable
NODE_ENV=production # Environment mode
HOST=0.0.0.0       # Host binding (default: all interfaces)
```

### SSL/HTTPS Setup

For production with SSL:

1. **Get SSL certificate** (Let's Encrypt recommended):
   ```bash
   certbot --nginx -d your-domain.com
   ```

2. **Update nginx config** with your domain in `nginx.conf`

3. **Enable HTTPS** in the nginx SSL section

4. **Start services**:
   ```bash
   # With nginx proxy
   PORT=3000 npm run start:http
   
   # Or with Docker Compose
   docker-compose up -d
   ```

### Production Checklist

- [ ] Configure custom port if needed
- [ ] Set up nginx reverse proxy
- [ ] Enable SSL/HTTPS
- [ ] Configure firewall (allow 80/443, block direct 3000)
- [ ] Set up log rotation
- [ ] Configure monitoring/alerts on `/health` endpoint
- [ ] Test SSE connections work through proxy
- [ ] Verify CORS headers for browser clients