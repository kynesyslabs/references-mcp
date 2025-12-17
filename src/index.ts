#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { GitDocumentationService } from './services/git-docs.js';
import { TokenCounter } from './services/token-counter.js';
import { UpdateScheduler } from './services/scheduler.js';

const server = new Server(
  {
    name: 'demosdk-docs-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const docService = new GitDocumentationService();
const tokenCounter = new TokenCounter();
const scheduler = new UpdateScheduler(docService);

// Tool schemas
const SearchDocsSchema = z.object({
  query: z.string().describe('Search query for documentation'),
  limit: z.number().optional().default(10).describe('Maximum results to return'),
  offset: z.number().optional().default(0).describe('Pagination offset'),
  module: z.string().optional().describe('Filter by module name (case-insensitive match)'),
  type: z
    .enum(['class','interface','module','function','enum','type','variable','index','other'])
    .optional()
    .describe('Filter by page type'),
});

const GetPageSchema = z.object({
  path: z.string().describe('Documentation page path'),
  section: z.string().optional().describe('Specific section within the page'),
});

const ListModulesSchema = z.object({
  limit: z.number().optional().default(50).describe('Maximum modules to return'),
  offset: z.number().optional().default(0).describe('Pagination offset'),
});

// Initialize documentation cache on startup
await docService.initialize();

// Start periodic update scheduler
scheduler.start();

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'search_docs',
        description: 'Search Demos SDK documentation with pagination support',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query for documentation' },
            limit: { type: 'number', description: 'Maximum results to return', default: 10 },
            offset: { type: 'number', description: 'Pagination offset', default: 0 },
            module: { type: 'string', description: 'Filter by module name (case-insensitive)' },
            type: { 
              type: 'string', 
              description: 'Filter by page type (class, interface, module, function, enum, type, variable, index, other)' 
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_page',
        description: 'Get a specific documentation page by path',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Documentation page path' },
            section: { type: 'string', description: 'Specific section within the page' },
          },
          required: ['path'],
        },
      },
      {
        name: 'list_modules',
        description: 'List all available modules in the documentation',
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Maximum modules to return', default: 50 },
            offset: { type: 'number', description: 'Pagination offset', default: 0 },
          },
          required: [],
        },
      },
      {
        name: 'get_stats',
        description: 'Get documentation statistics and cache info',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'update_docs',
        description: 'Update documentation from the Git repository',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'search_docs': {
        const parsed = SearchDocsSchema.parse(args);
        const results = await docService.search(parsed.query, {
          limit: parsed.limit,
          offset: parsed.offset,
          module: parsed.module,
          type: parsed.type,
        });
        
        // Ensure response stays under token limit
        const response = {
          results: results.results,
          total: results.total,
          offset: results.offset,
          hasMore: results.hasMore,
        };
        
        const tokens = tokenCounter.count(JSON.stringify(response));
        if (tokens > 25000) {
          // Truncate results if needed
          const truncated = await tokenCounter.truncateToLimit(response, 25000);
          return { content: [{ type: 'text', text: JSON.stringify(truncated, null, 2) }] };
        }
        
        return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
      }

      case 'get_page': {
        const parsed = GetPageSchema.parse(args);
        const page = await docService.getPage(parsed.path, parsed.section);
        
        if (!page) {
          return { 
            content: [{ 
              type: 'text', 
              text: JSON.stringify({ error: 'Page not found' }, null, 2) 
            }] 
          };
        }
        
        // Ensure response stays under token limit
        const tokens = tokenCounter.count(JSON.stringify(page));
        if (tokens > 25000) {
          const truncated = await tokenCounter.truncateToLimit(page, 25000);
          return { content: [{ type: 'text', text: JSON.stringify(truncated, null, 2) }] };
        }
        
        return { content: [{ type: 'text', text: JSON.stringify(page, null, 2) }] };
      }

      case 'list_modules': {
        const parsed = ListModulesSchema.parse(args);
        const modules = await docService.listModules({
          limit: parsed.limit,
          offset: parsed.offset,
        });
        
        return { content: [{ type: 'text', text: JSON.stringify(modules, null, 2) }] };
      }

      case 'get_stats': {
        const stats = await docService.getStats();
        return { content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }] };
      }

      case 'update_docs': {
        await docService.updateDocumentation();
        const stats = await docService.getStats();
        return { 
          content: [{ 
            type: 'text', 
            text: JSON.stringify({ 
              message: 'Documentation updated successfully',
              ...stats 
            }, null, 2) 
          }] 
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error: error instanceof Error ? error.message : 'Unknown error',
            },
            null,
            2
          ),
        },
      ],
    };
  }
});

// Start the server with the appropriate transport
const args = process.argv.slice(2);
const transportType = args.includes('--http') ? 'http' : 'stdio';

let transport: StdioServerTransport | StreamableHTTPServerTransport;

if (transportType === 'http') {
  const http = await import('http');
  
  transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // Stateless mode for LLM clients
    enableJsonResponse: true // Enable direct JSON responses instead of SSE
  });

  // Create HTTP server that integrates both health check and MCP transport
  const httpServer = http.createServer(async (req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }));
    } else {
      // Handle MCP requests at root and other paths
      try {
        await (transport as StreamableHTTPServerTransport).handleRequest(req, res);
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    }
  });
  
  // Add cleanup for SSE connections when the process exits
  process.on('SIGINT', async () => {
    console.error('Gracefully shutting down...');
    await transport.close();
    process.exit(0);
  });

  httpServer.listen(3000, async () => {
    console.error('HTTP Server listening on port 3000');
    // Connect the MCP server after HTTP server is listening
    await server.connect(transport);
    console.error('MCP Server connected and ready');
  });
  
  console.error(`Demos SDK Documentation MCP Server running on StreamableHTTP...`);
} else {
  transport = new StdioServerTransport();
  console.error('Demos SDK Documentation MCP Server running on stdio...');
  await server.connect(transport);
}
