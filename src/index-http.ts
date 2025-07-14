#!/usr/bin/env node
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
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
      console.log('StreamableHTTP MCP server initialized successfully');
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
    });
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
          text: `# @kynesyslabs/demosdk API Reference (StreamableHTTP)

## Overview
This documentation contains ${pages.totalPages} pages across ${pages.moduleCount} modules.
Server running with StreamableHTTP transport.

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
      
      const resultJson = JSON.stringify(formattedResult);
      
      if (currentChars + resultJson.length > MAX_RESPONSE_CHARS) {
        break;
      }
      
      formattedResults.push(formattedResult);
      currentChars += resultJson.length;
    }

    const hasMore = results.length > formattedResults.length;
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
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
          }, null, 2)
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

      const resultJson = JSON.stringify(codeResult);
      
      if (currentChars + resultJson.length > MAX_RESPONSE_CHARS) {
        break;
      }
      
      codeResults.push(codeResult);
      currentChars += resultJson.length;
    }

    const hasMore = results.length > codeResults.length;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
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
          }, null, 2)
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

  getServer(): Server {
    return this.server;
  }
}

async function main() {
  const port = parseInt(process.env.MCP_PORT || process.env.PORT || '3000');
  const mcpServer = new DemoSDKHTTPMCPServer();
  
  // Wait for server initialization
  await new Promise(resolve => {
    const checkInit = () => {
      if ((mcpServer as any).isInitialized) {
        resolve(true);
      } else {
        setTimeout(checkInit, 100);
      }
    };
    checkInit();
  });

  const app = express();
  app.use(express.json());
  
  // CORS configuration
  app.use(cors({
    origin: '*',
    exposedHeaders: ["Mcp-Session-Id"]
  }));

  // Map to store transports by session ID
  const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      initialized: (mcpServer as any).isInitialized,
      pages: (mcpServer as any).searcher?.getStats().totalPages || 0,
      activeSessions: Object.keys(transports).length,
      transport: 'StreamableHTTP'
    });
  });

  // Server info endpoint
  app.get('/', (req, res) => {
    res.json({
      name: 'DemoSDK API Reference MCP Server',
      version: '1.0.0',
      transport: 'StreamableHTTP',
      endpoints: {
        'GET /mcp': 'Start MCP session',
        'POST /mcp': 'Send MCP message',
        'DELETE /mcp': 'Close MCP session',
        'GET /health': 'Health check',
        'GET /': 'Server info'
      },
      activeSessions: Object.keys(transports).length,
      usage: 'Connect MCP-compatible clients to /mcp endpoint'
    });
  });

  // MCP POST endpoint
  const mcpPostHandler = async (req: express.Request, res: express.Response) => {
    const sessionId = req.headers['mcp-session-id'] as string;
    
    if (sessionId) {
      console.log(`Received MCP request for session: ${sessionId}`);
    } else {
      console.log('New MCP request (no session ID)');
    }

    try {
      let transport: StreamableHTTPServerTransport;
      
      if (sessionId && transports[sessionId]) {
        // Reuse existing transport
        transport = transports[sessionId];
      } else if (!sessionId && isInitializeRequest(req.body)) {
        // New initialization request
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sessionId: string) => {
            console.log(`Session initialized with ID: ${sessionId}`);
            transports[sessionId] = transport;
          },
          onsessionclosed: (sessionId: string) => {
            console.log(`Session closed: ${sessionId}`);
            delete transports[sessionId];
          }
        });

        // Set up onclose handler
        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && transports[sid]) {
            console.log(`Transport closed for session ${sid}`);
            delete transports[sid];
          }
        };

        // Connect the transport to the MCP server
        await mcpServer.getServer().connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      } else {
        // Invalid request
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided',
          },
          id: null,
        });
        return;
      }

      // Handle request with existing transport
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('Error handling MCP request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  };

  // MCP GET endpoint for SSE
  const mcpGetHandler = async (req: express.Request, res: express.Response) => {
    const sessionId = req.headers['mcp-session-id'] as string;
    
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    console.log(`Establishing SSE stream for session ${sessionId}`);
    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
  };

  // MCP DELETE endpoint for session termination
  const mcpDeleteHandler = async (req: express.Request, res: express.Response) => {
    const sessionId = req.headers['mcp-session-id'] as string;
    
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    console.log(`Session termination request for session ${sessionId}`);
    try {
      const transport = transports[sessionId];
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error('Error handling session termination:', error);
      if (!res.headersSent) {
        res.status(500).send('Error processing session termination');
      }
    }
  };

  // Set up MCP routes
  app.post('/mcp', mcpPostHandler);
  app.get('/mcp', mcpGetHandler);
  app.delete('/mcp', mcpDeleteHandler);

  // Start the server
  app.listen(port, () => {
    console.log(`🚀 DemoSDK MCP Server running on http://localhost:${port}`);
    console.log(`📡 StreamableHTTP endpoint: http://localhost:${port}/mcp`);
    console.log(`🏥 Health check: http://localhost:${port}/health`);
    console.log(`📋 Server info: http://localhost:${port}/`);
    console.log(`🔌 Ready for MCP client connections`);
  });

  // Handle server shutdown
  process.on('SIGINT', async () => {
    console.log('📴 Shutting down StreamableHTTP server...');
    for (const sessionId in transports) {
      try {
        console.log(`Closing transport for session ${sessionId}`);
        await transports[sessionId].close();
        delete transports[sessionId];
      } catch (error) {
        console.error(`Error closing transport for session ${sessionId}:`, error);
      }
    }
    console.log('Server shutdown complete');
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('📴 Shutting down StreamableHTTP server...');
    for (const sessionId in transports) {
      try {
        await transports[sessionId].close();
        delete transports[sessionId];
      } catch (error) {
        console.error(`Error closing transport for session ${sessionId}:`, error);
      }
    }
    process.exit(0);
  });
}

main().catch(error => {
  console.error('Failed to start StreamableHTTP server:', error);
  process.exit(1);
});