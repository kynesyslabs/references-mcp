#!/usr/bin/env node

import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

// Simple MCP inspector for testing our server
const serverPath = join(process.cwd(), 'dist', 'index.js');

console.log('🔍 MCP Server Inspector');
console.log('========================');
console.log('Server:', serverPath);
console.log('');

// Start the server
const server = spawn('node', [serverPath], {
  stdio: ['pipe', 'pipe', 'pipe']
});

// Test messages
const testMessages = [
  // List tools
  {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
    params: {}
  },
  // Search for "Demos"
  {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'search_demosdk_api_ref_docs',
      arguments: {
        query: 'Demos',
        limit: 5
      }
    }
  },
  // Search for code
  {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'search_demosdk_api_ref_code',
      arguments: {
        query: 'import',
        page: 1
      }
    }
  },
  // Get modules
  {
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {
      name: 'get_modules',
      arguments: {}
    }
  },
  // Get stats
  {
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: {
      name: 'get_stats',
      arguments: {}
    }
  }
];

let messageIndex = 0;
let responses = [];

server.stdout.on('data', (data) => {
  const lines = data.toString().split('\n').filter(line => line.trim());
  
  for (const line of lines) {
    if (line.startsWith('Parsing') || line.startsWith('Parsed') || line.startsWith('MCP server') || line.startsWith('DemoSDK')) {
      console.log('🔄', line);
      continue;
    }
    
    try {
      const response = JSON.parse(line);
      responses.push(response);
      
      console.log(`📨 Response ${response.id}:`);
      
      if (response.result && response.result.tools) {
        console.log(`   Found ${response.result.tools.length} tools:`);
        response.result.tools.forEach(tool => {
          console.log(`   - ${tool.name}: ${tool.description}`);
        });
      } else if (response.result && response.result.content) {
        const content = response.result.content[0].text;
        try {
          const parsed = JSON.parse(content);
          if (parsed.results) {
            console.log(`   Found ${parsed.results.length} results`);
            if (parsed.pagination) {
              console.log(`   Pagination: ${parsed.pagination.returned} of ${parsed.pagination.returned}, hasMore: ${parsed.pagination.hasMore}`);
            }
            if (parsed.usage) {
              console.log(`   Usage: ${parsed.usage.charactersUsed}/${parsed.usage.maxCharacters} chars`);
            }
          } else if (parsed.modules) {
            console.log(`   Found ${parsed.modules.length} modules:`, parsed.modules.slice(0, 5).join(', '));
          } else if (parsed.totalPages) {
            console.log(`   Stats: ${parsed.totalPages} total pages, ${parsed.moduleCount} modules`);
          }
        } catch (e) {
          console.log(`   Content length: ${content.length} chars`);
        }
      }
      
      console.log('');
      
      // Send next test message
      if (messageIndex < testMessages.length) {
        setTimeout(() => {
          const message = testMessages[messageIndex];
          messageIndex++;
          
          console.log(`📤 Sending test ${messageIndex}: ${message.params.name || 'tools/list'}`);
          server.stdin.write(JSON.stringify(message) + '\n');
        }, 1000);
      } else {
        // All tests done
        console.log('✅ All tests completed');
        server.kill();
        process.exit(0);
      }
    } catch (e) {
      console.log('📄', line);
    }
  }
});

server.stderr.on('data', (data) => {
  console.error('❌ Error:', data.toString());
});

server.on('close', (code) => {
  console.log(`🏁 Server exited with code ${code}`);
});

// Wait for server to initialize, then start testing
setTimeout(() => {
  console.log('🚀 Starting tests...\n');
  
  const message = testMessages[messageIndex];
  messageIndex++;
  
  console.log(`📤 Sending test ${messageIndex}: ${message.params.name || 'tools/list'}`);
  server.stdin.write(JSON.stringify(message) + '\n');
}, 3000);

// Timeout after 30 seconds
setTimeout(() => {
  console.log('⏰ Timeout reached, stopping server');
  server.kill();
  process.exit(1);
}, 30000);