#!/usr/bin/env node

import { spawn } from 'child_process';

// Test various search scenarios
const testCases = [
  {
    name: 'Basic search',
    tool: 'search_demosdk_api_ref_docs',
    args: { query: 'Demos', limit: 3 }
  },
  {
    name: 'Function search',
    tool: 'search_demosdk_api_ref_docs',
    args: { query: 'findWrappedToken', limit: 3 }
  },
  {
    name: 'Module filter',
    tool: 'search_demosdk_api_ref_docs',
    args: { query: 'class', moduleName: 'websdk', limit: 3 }
  },
  {
    name: 'Type filter',
    tool: 'search_demosdk_api_ref_docs',
    args: { query: 'interface', type: 'interface', limit: 3 }
  },
  {
    name: 'Code search',
    tool: 'search_demosdk_api_ref_code',
    args: { query: 'async', page: 1 }
  },
  {
    name: 'Fuzzy search',
    tool: 'search_demosdk_api_ref_docs',
    args: { query: 'Demmo', fuzzyMatch: true, limit: 3 }
  },
  {
    name: 'Pagination test',
    tool: 'search_demosdk_api_ref_docs',
    args: { query: 'transaction', limit: 2, offset: 0 }
  },
  {
    name: 'Pagination test page 2',
    tool: 'search_demosdk_api_ref_docs',
    args: { query: 'transaction', limit: 2, offset: 2 }
  }
];

console.log('🧪 Testing MCP Server Search Functionality');
console.log('==========================================');

const server = spawn('node', ['dist/index.js'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let testIndex = 0;

server.stdout.on('data', (data) => {
  const lines = data.toString().split('\n').filter(line => line.trim());
  
  for (const line of lines) {
    if (line.startsWith('Parsing') || line.startsWith('Parsed') || line.startsWith('MCP server') || line.startsWith('DemoSDK')) {
      console.log('🔄', line);
      continue;
    }
    
    try {
      const response = JSON.parse(line);
      
      if (response.result && response.result.content) {
        const content = response.result.content[0].text;
        const parsed = JSON.parse(content);
        
        const testCase = testCases[testIndex - 1];
        console.log(`\n✅ ${testCase.name}:`);
        
        if (parsed.results) {
          console.log(`   📊 Results: ${parsed.results.length}`);
          if (parsed.pagination) {
            console.log(`   📄 Pagination: offset=${parsed.pagination.offset}, hasMore=${parsed.pagination.hasMore}`);
          }
          if (parsed.usage) {
            console.log(`   💾 Usage: ${parsed.usage.charactersUsed}/${parsed.usage.maxCharacters} chars`);
          }
          
          // Show first result
          if (parsed.results.length > 0) {
            const first = parsed.results[0];
            console.log(`   🎯 Top result: ${first.title} (${first.type}, score: ${first.score})`);
            if (first.snippet) {
              console.log(`   📝 Snippet: ${first.snippet.slice(0, 100)}...`);
            }
          }
        }
        
        // Run next test
        if (testIndex < testCases.length) {
          setTimeout(() => runTest(testIndex), 500);
        } else {
          console.log('\n🎉 All tests completed successfully!');
          server.kill();
          process.exit(0);
        }
      }
    } catch (e) {
      // Ignore non-JSON lines
    }
  }
});

function runTest(index) {
  const testCase = testCases[index];
  testIndex++;
  
  console.log(`\n📤 Running: ${testCase.name}`);
  
  const message = {
    jsonrpc: '2.0',
    id: testIndex,
    method: 'tools/call',
    params: {
      name: testCase.tool,
      arguments: testCase.args
    }
  };
  
  server.stdin.write(JSON.stringify(message) + '\n');
}

server.stderr.on('data', (data) => {
  console.error('❌ Error:', data.toString());
});

// Wait for server to initialize
setTimeout(() => {
  console.log('\n🚀 Starting search tests...');
  runTest(0);
}, 3000);

// Timeout
setTimeout(() => {
  console.log('\n⏰ Test timeout');
  server.kill();
  process.exit(1);
}, 60000);