#!/usr/bin/env node
import 'dotenv/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'crypto';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import * as path from 'path';
import { TypeDocParser } from './parser.js';
import { DocumentSearcher, SearchOptions } from './search.js';
import { ParsedPage, ParserConfig } from './types.js';

// HTTP version of the MCP server using StreamableHTTP transport
export class DemoSDKHTTPMCPServer {
  private server: Server;
  private parser!: TypeDocParser;
  private searcher: DocumentSearcher | null = null;
  private isInitialized = false;

  constructor() {
    this.server = new Server(
      {
        name: 'demosdk-api-ref-http',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
    this.initializeParser();
  }

  private async initializeParser(): Promise<void> {
    const basePath = path.join(process.cwd(), 'demosdk-api-ref');
    
    const config: ParserConfig = {
      basePath,
      watchFiles: false,
      includePatterns: [],
      excludePatterns: ['assets/']
    };

    this.parser = new TypeDocParser(config);
    
    try {
      console.log('Parsing TypeDoc documentation...');
      const result = await this.parser.parseAll();
      console.log(`Parsed ${result.totalPages} pages in ${result.parseTime}ms`);
      
      if (result.errors.length > 0) {
        console.warn(`Encountered ${result.errors.length} errors during parsing`);
      }

      this.searcher = new DocumentSearcher(result.pages);
      this.isInitialized = true;
      console.log('HTTP MCP server initialized successfully');
    } catch (error) {
      console.error('Failed to initialize parser:', error);
      throw error;
    }
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.getTools(),
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (!this.isInitialized || !this.searcher) {
        throw new Error('Server not initialized. Please wait for initialization to complete.');
      }

      // Add timeout wrapper to prevent runaway operations
      return this.withTimeout(async () => {
        switch (name) {
          case 'fetch_demosdk_api_ref_docs':
            return this.fetchAllDocs();
          
          case 'search_demosdk_api_ref_docs':
            return this.searchDocs(args);
          
          case 'search_demosdk_api_ref_code':
            return this.searchCode(args);
          
          case 'fetch_generic_url_content':
            return this.fetchGenericContent(args);
          
          case 'get_modules':
            return this.getModules();
          
          case 'get_page_by_path':
            return this.getPageByPath(args);
          
          case 'get_stats':
            return this.getStats();

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      }, 30000); // 30 second timeout
    });
  }

  private async withTimeout<T>(operation: () => Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      operation(),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);
  }

  private getTools(): Tool[] {
    return [
      {
        name: 'fetch_demosdk_api_ref_docs',
        description: 'Fetch entire documentation file from the kynesyslabs/demosdk-api-ref. Useful for general questions.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'search_demosdk_api_ref_docs',
        description: 'Semantically search within the documentation. Useful for specific queries with pagination support.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search query to find relevant documentation',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results to return (default: 10, max: 50)',
              default: 10,
            },
            offset: {
              type: 'number',
              description: 'Number of results to skip for pagination (default: 0)',
              default: 0,
            },
            type: {
              type: 'string',
              enum: ['index', 'modules', 'module', 'class', 'function', 'interface', 'enum', 'type', 'variable'],
              description: 'Filter by page type',
            },
            moduleName: {
              type: 'string',
              description: 'Filter by module name',
            },
            fuzzyMatch: {
              type: 'boolean',
              description: 'Enable fuzzy matching for typos (default: false)',
              default: false,
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'search_demosdk_api_ref_code',
        description: 'Search for code within the documentation. Returns matching code blocks with context.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search query to find relevant code',
            },
            page: {
              type: 'number',
              description: 'Page number to retrieve (starting from 1). Each page contains 30 results.',
              default: 1,
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'fetch_generic_url_content',
        description: 'Get content from a specific page by relative path (e.g., "classes/websdk.Demos.html")',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'The relative path to the documentation page',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'get_modules',
        description: 'Get list of all available modules in the documentation',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'get_page_by_path',
        description: 'Get a specific page by its file path',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'The relative path to the documentation page',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'get_stats',
        description: 'Get statistics about the documentation',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    ];
  }

  private async fetchAllDocs(): Promise<any> {
    const pages = this.searcher!.getStats();
    const modules = this.searcher!.getModules();
    
    return {
      content: [
        {
          type: 'text',
          text: `# @kynesyslabs/demosdk API Reference (HTTP)

## Overview
This documentation contains ${pages.totalPages} pages across ${pages.moduleCount} modules.
Server running with HTTP/SSE transport.

## Available Modules
${modules.map(module => `- ${module}`).join('\n')}

## Page Types
${Object.entries(pages.pagesByType).map(([type, count]) => `- ${type}: ${count} pages`).join('\n')}

## Usage
Use the search tools to find specific documentation:
- \`search_demosdk_api_ref_docs\` for general searches
- \`search_demosdk_api_ref_code\` for code-specific searches
- \`get_modules\` to see all available modules
- \`fetch_generic_url_content\` to get specific pages

The documentation is automatically updated from the TypeDoc generated files.`
        }
      ]
    };
  }

  private async searchDocs(args: any): Promise<any> {
    const { query, limit = 10, offset = 0, type, moduleName, fuzzyMatch = false } = args;
    
    if (!query) {
      throw new Error('Query parameter is required');
    }

    const options: SearchOptions = {
      limit: Math.min(limit, 50),
      offset,
      type,
      moduleName,
      fuzzyMatch,
      includeContent: false,
    };

    const results = this.searcher!.search(query, options);
    
    const MAX_RESPONSE_CHARS = 20000;
    let currentChars = 0;
    const formattedResults = [];
    
    // Pre-calculate base response size to avoid repeated JSON.stringify
    const baseResponseSize = JSON.stringify({
      query,
      transport: 'StreamableHTTP',
      pagination: { limit, offset, returned: 0, hasMore: false, nextOffset: null },
      results: [],
      usage: { charactersUsed: 0, maxCharacters: MAX_RESPONSE_CHARS }
    }).length;
    
    currentChars = baseResponseSize;
    
    for (const result of results) {
      const snippet = result.matches.length > 0 
        ? result.matches[0].snippet 
        : result.page.content.slice(0, 150) + '...';
      
      const formattedResult = {
        title: result.page.title,
        type: result.page.type,
        moduleName: result.page.moduleName,
        className: result.page.className,
        functionName: result.page.functionName,
        relativePath: result.page.relativePath,
        score: result.score,
        snippet,
        hasCodeBlocks: result.page.codeBlocks.length > 0,
        functionCount: result.page.metadata.functions.length,
        classCount: result.page.metadata.classes.length,
        interfaceCount: result.page.metadata.interfaces.length,
      };
      
      // Estimate size more efficiently
      const estimatedSize = JSON.stringify(formattedResult).length + 10;
      
      if (currentChars + estimatedSize > MAX_RESPONSE_CHARS) {
        break;
      }
      
      formattedResults.push(formattedResult);
      currentChars += estimatedSize;
    }

    const hasMore = results.length > formattedResults.length;
    
    // Build final response object once and stringify once
    const responseData = {
      query,
      transport: 'StreamableHTTP',
      pagination: {
        limit,
        offset,
        returned: formattedResults.length,
        hasMore,
        nextOffset: hasMore ? offset + limit : null,
      },
      results: formattedResults,
      usage: {
        charactersUsed: currentChars,
        maxCharacters: MAX_RESPONSE_CHARS,
      }
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(responseData, null, 2)
        }
      ]
    };
  }

  private async searchCode(args: any): Promise<any> {
    const { query, page = 1 } = args;
    
    if (!query) {
      throw new Error('Query parameter is required');
    }

    const pageSize = 20;
    const offset = (page - 1) * pageSize;

    const results = this.searcher!.search(query, {
      limit: pageSize * 2,
      offset,
      includeContent: false,
    });

    const MAX_RESPONSE_CHARS = 20000;
    let currentChars = 0;
    const codeResults = [];

    // Pre-calculate base response size
    const baseResponseSize = JSON.stringify({
      query,
      transport: 'StreamableHTTP',
      pagination: { page, pageSize, returned: 0, hasMore: false, nextPage: null },
      results: [],
      usage: { charactersUsed: 0, maxCharacters: MAX_RESPONSE_CHARS }
    }).length;
    
    currentChars = baseResponseSize;

    for (const result of results) {
      if (result.page.codeBlocks.length === 0) continue;
      
      const relevantCodeBlocks = result.page.codeBlocks.filter(block => 
        block.code.toLowerCase().includes(query.toLowerCase())
      );

      if (relevantCodeBlocks.length === 0) continue;

      const truncatedCodeBlocks = relevantCodeBlocks.map(block => ({
        ...block,
        code: block.code.length > 1000 ? block.code.slice(0, 1000) + '\n... (truncated)' : block.code
      }));

      const codeResult = {
        title: result.page.title,
        type: result.page.type,
        moduleName: result.page.moduleName,
        relativePath: result.page.relativePath,
        codeBlocks: truncatedCodeBlocks,
        score: result.score,
        totalCodeBlocks: result.page.codeBlocks.length,
        relevantCodeBlocks: relevantCodeBlocks.length,
      };

      // Estimate size efficiently
      const estimatedSize = JSON.stringify(codeResult).length + 10;
      
      if (currentChars + estimatedSize > MAX_RESPONSE_CHARS) {
        break;
      }
      
      codeResults.push(codeResult);
      currentChars += estimatedSize;
    }

    const hasMore = results.length > codeResults.length;

    // Build final response object once and stringify once
    const responseData = {
      query,
      transport: 'StreamableHTTP',
      pagination: {
        page,
        pageSize,
        returned: codeResults.length,
        hasMore,
        nextPage: hasMore ? page + 1 : null,
      },
      results: codeResults,
      usage: {
        charactersUsed: currentChars,
        maxCharacters: MAX_RESPONSE_CHARS,
      }
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(responseData, null, 2)
        }
      ]
    };
  }

  private async fetchGenericContent(args: any): Promise<any> {
    const { path } = args;
    
    if (!path) {
      throw new Error('Path parameter is required');
    }

    const pages = this.parser.getPages();
    const page = pages.find(p => p.relativePath === path);
    
    if (!page) {
      throw new Error(`Page not found: ${path}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            title: page.title,
            type: page.type,
            moduleName: page.moduleName,
            className: page.className,
            functionName: page.functionName,
            content: page.content,
            codeBlocks: page.codeBlocks,
            metadata: page.metadata,
            transport: 'StreamableHTTP',
          }, null, 2)
        }
      ]
    };
  }

  private async getModules(): Promise<any> {
    const modules = this.searcher!.getModules();
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            modules,
            count: modules.length,
            transport: 'StreamableHTTP',
          }, null, 2)
        }
      ]
    };
  }

  private async getPageByPath(args: any): Promise<any> {
    const { path } = args;
    
    if (!path) {
      throw new Error('Path parameter is required');
    }

    const page = this.parser.getPage(path);
    
    if (!page) {
      throw new Error(`Page not found: ${path}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ...page,
            transport: 'StreamableHTTP',
          }, null, 2)
        }
      ]
    };
  }

  private async getStats(): Promise<any> {
    const stats = this.searcher!.getStats();
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ...stats,
            transport: 'StreamableHTTP',
          }, null, 2)
        }
      ]
    };
  }

  async run(port: number = 3000): Promise<void> {
    const http = await import('http');
    
    // Session management - store transports by session ID
    const activeTransports = new Map<string, StreamableHTTPServerTransport>();
    
    const httpServer = http.createServer(async (req, res) => {
      try {
        // Enable CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session-Id');
        
        if (req.method === 'OPTIONS') {
          res.writeHead(200);
          res.end();
          return;
        }
        
        const parsedUrl = new URL(req.url || '', `http://${req.headers.host || `localhost:${port}`}`);
        
        // Handle health check endpoint
        if (req.method === 'GET' && parsedUrl.pathname === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'healthy',
            initialized: this.isInitialized,
            pages: this.searcher?.getStats().totalPages || 0,
            activeSessions: activeTransports.size,
            transport: 'StreamableHTTP'
          }));
          return;
        }
        
        // Check if this is an MCP request vs server info request
        const isMcpRequest = req.headers.accept?.includes('text/event-stream') || 
                           req.headers.accept?.includes('application/json') ||
                           req.headers['mcp-session-id'] ||
                           req.headers['content-type']?.includes('application/json');
        
        // Handle MCP communication on root path
        if (parsedUrl.pathname === '/' && isMcpRequest) {
          // Check if this is an initialization request or has session ID
          const sessionId = req.headers['mcp-session-id'] as string;
          
          let transport: StreamableHTTPServerTransport;
          
          if (req.method === 'POST') {
            // For POST requests, check if this is initialization or existing session
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
              try {
                const parsedBody = JSON.parse(body);
                const isInit = parsedBody.method === 'initialize';
                
                if (isInit && !sessionId) {
                  // New initialization request - create new transport
                  transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => randomUUID(),
                    onsessioninitialized: (newSessionId: string) => {
                      activeTransports.set(newSessionId, transport);
                      console.log(`✅ Session initialized: ${newSessionId}`);
                    },
                    onsessionclosed: (closedSessionId: string) => {
                      activeTransports.delete(closedSessionId);
                      console.log(`🧹 Session closed: ${closedSessionId}`);
                    },
                    allowedOrigins: ['*'],
                    enableDnsRebindingProtection: false,
                  });
                  
                  // Connect new transport to server
                  await this.server.connect(transport);
                  
                  // Handle the initialization request
                  await transport.handleRequest(req, res, parsedBody);
                } else if (sessionId && activeTransports.has(sessionId)) {
                  // Existing session request
                  transport = activeTransports.get(sessionId)!;
                  await transport.handleRequest(req, res, parsedBody);
                } else {
                  // Invalid request
                  res.writeHead(400, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({
                    jsonrpc: '2.0',
                    error: {
                      code: -32000,
                      message: 'Bad Request: Invalid session or missing initialization'
                    },
                    id: null
                  }));
                }
              } catch (error) {
                console.error('Error parsing request:', error);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  jsonrpc: '2.0',
                  error: {
                    code: -32700,
                    message: 'Parse error'
                  },
                  id: null
                }));
              }
            });
            return;
          } else if (req.method === 'GET') {
            // GET request for SSE stream - must have session ID
            if (sessionId && activeTransports.has(sessionId)) {
              transport = activeTransports.get(sessionId)!;
              await transport.handleRequest(req, res);
            } else {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                jsonrpc: '2.0',
                error: {
                  code: -32000,
                  message: 'Bad Request: Invalid session ID for SSE stream'
                },
                id: null
              }));
            }
            return;
          } else if (req.method === 'DELETE') {
            // DELETE request for session termination
            if (sessionId && activeTransports.has(sessionId)) {
              transport = activeTransports.get(sessionId)!;
              await transport.handleRequest(req, res);
            } else {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                jsonrpc: '2.0',
                error: {
                  code: -32000,
                  message: 'Bad Request: Invalid session ID for termination'
                },
                id: null
              }));
            }
            return;
          }
        }
        
        // Handle server info endpoint (GET without MCP headers)
        if (req.method === 'GET' && parsedUrl.pathname === '/' && !isMcpRequest) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            name: 'DemoSDK API Reference MCP Server',
            version: '1.0.0',
            transport: 'StreamableHTTP',
            endpoints: {
              'GET /': 'Start MCP session or get server info',
              'POST /': 'Send MCP message',
              'DELETE /': 'Close MCP session',
              'GET /health': 'Health check'
            },
            activeSessions: activeTransports.size,
            usage: 'Connect MCP-compatible clients to root endpoint'
          }));
          return;
        }
        
        // 404 for other paths
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
        
      } catch (error) {
        console.error('❌ Server error:', error);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            error: 'Internal server error',
            message: error instanceof Error ? error.message : 'Unknown error'
          }));
        }
      }
    });
    
    // Handle server shutdown gracefully
    process.on('SIGINT', () => {
      console.log('📴 Shutting down StreamableHTTP server...');
      for (const [sessionId, transport] of activeTransports.entries()) {
        console.log(`Closing transport for session ${sessionId}`);
        transport.close();
      }
      activeTransports.clear();
      httpServer.close();
    });
    
    httpServer.listen(port, () => {
      console.log(`🚀 DemoSDK MCP Server running on http://localhost:${port}`);
      console.log(`📡 StreamableHTTP endpoint: http://localhost:${port}/`);
      console.log(`🏥 Health check: http://localhost:${port}/health`);
      console.log(`📋 Server info: http://localhost:${port}/ (browser)`);
      console.log(`🔌 Ready for MCP client connections`);
    });
  }
}

async function main() {
  const server = new DemoSDKHTTPMCPServer();
  const port = parseInt(process.env.MCP_PORT || process.env.PORT || '3000');
  
  process.on('SIGINT', () => {
    console.log('Shutting down StreamableHTTP server...');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('Shutting down StreamableHTTP server...');
    process.exit(0);
  });

  try {
    await server.run(port);
  } catch (error) {
    console.error('Failed to start StreamableHTTP server:', error);
    process.exit(1);
  }
}

main();