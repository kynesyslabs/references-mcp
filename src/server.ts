import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import * as path from 'path';
import { TypeDocParser } from './parser.js';
import { DocumentSearcher, SearchOptions } from './search.js';
import { ParsedPage, ParserConfig } from './types.js';

export class DemoSDKMCPServer {
  private server: Server;
  private parser!: TypeDocParser;
  private searcher: DocumentSearcher | null = null;
  private isInitialized = false;

  constructor() {
    this.server = new Server(
      {
        name: 'demosdk-api-ref',
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
      console.log('MCP server initialized successfully');
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
          text: `# @kynesyslabs/demosdk API Reference

## Overview
This documentation contains ${pages.totalPages} pages across ${pages.moduleCount} modules.

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
      includeContent: false, // Don't include full content to save tokens
    };

    const results = this.searcher!.search(query, options);
    
    // Character limit for MCP responses (conservative estimate)
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
        // Include key metadata for quick reference
        hasCodeBlocks: result.page.codeBlocks.length > 0,
        functionCount: result.page.metadata.functions.length,
        classCount: result.page.metadata.classes.length,
        interfaceCount: result.page.metadata.interfaces.length,
      };
      
      const resultJson = JSON.stringify(formattedResult);
      
      // Check if adding this result would exceed the limit
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

    const pageSize = 20; // Smaller page size for code results
    const offset = (page - 1) * pageSize;

    const results = this.searcher!.search(query, {
      limit: pageSize * 2, // Get more to filter
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

      // Truncate large code blocks to fit within response limits
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
      
      // Check if adding this result would exceed the limit
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
          text: JSON.stringify(page, null, 2)
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
          text: JSON.stringify(stats, null, 2)
        }
      ]
    };
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log('DemoSDK MCP Server running on stdio');
  }
}