#!/usr/bin/env node

import { spawn } from 'child_process';

console.log('🧪 Testing MCP Client Connection to SSE Server');
console.log('================================================');

// Start the SSE server
const server = spawn('node', ['dist/index-http.js'], {
  stdio: 'pipe'
});

let serverReady = false;

server.stdout.on('data', (data) => {
  const output = data.toString();
  console.log('📝 Server:', output.trim());
  
  if (output.includes('Ready for MCP client connections')) {
    serverReady = true;
    testMCPConnection();
  }
});

server.stderr.on('data', (data) => {
  console.error('❌ Server Error:', data.toString());
});

async function testMCPConnection() {
  console.log('\n🚀 Testing MCP Protocol over SSE...\n');
  
  try {
    // Step 1: Establish SSE connection
    console.log('1️⃣ Connecting to SSE endpoint...');
    const sseResponse = await fetch('http://localhost:3000/message');
    
    if (!sseResponse.ok) {
      throw new Error(`SSE connection failed: ${sseResponse.status}`);
    }
    
    console.log('✅ SSE connection established');
    
    // Step 2: Read the endpoint from SSE stream
    const reader = sseResponse.body.getReader();
    const { value } = await reader.read();
    const chunk = new TextDecoder().decode(value);
    
    const endpointMatch = chunk.match(/data: (.+)/);
    if (!endpointMatch) {
      throw new Error('Could not extract endpoint from SSE stream');
    }
    
    const endpointUrl = decodeURI(endpointMatch[1]);
    console.log('✅ Got endpoint:', endpointUrl);
    
    // Step 3: Test tools/list
    console.log('\n2️⃣ Testing tools/list...');
    const listToolsMessage = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {}
    };
    
    const listResponse = await fetch(`http://localhost:3000${endpointUrl}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(listToolsMessage)
    });
    
    console.log('✅ tools/list response status:', listResponse.status);
    
    // Wait for SSE response
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const { value: listResult } = await reader.read();
    if (listResult) {
      const listData = new TextDecoder().decode(listResult);
      console.log('✅ tools/list SSE response:');
      console.log(listData);
      
      // Parse the JSON from SSE data
      const jsonMatch = listData.match(/data: (.+)/);
      if (jsonMatch) {
        try {
          const responseData = JSON.parse(jsonMatch[1]);
          console.log('✅ Parsed tools:', responseData.result?.tools?.length || 0, 'tools found');
        } catch (e) {
          console.log('📄 Raw SSE data:', listData);
        }
      }
    }
    
    // Step 4: Test search
    console.log('\n3️⃣ Testing search...');
    const searchMessage = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'search_demosdk_api_ref_docs',
        arguments: {
          query: 'Demos',
          limit: 2
        }
      }
    };
    
    const searchResponse = await fetch(`http://localhost:3000${endpointUrl}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(searchMessage)
    });
    
    console.log('✅ search response status:', searchResponse.status);
    
    // Wait for SSE response
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const { value: searchResult } = await reader.read();
    if (searchResult) {
      const searchData = new TextDecoder().decode(searchResult);
      console.log('✅ search SSE response received');
      
      // Parse the JSON from SSE data
      const jsonMatch = searchData.match(/data: (.+)/);
      if (jsonMatch) {
        try {
          const responseData = JSON.parse(jsonMatch[1]);
          const searchResults = JSON.parse(responseData.result?.content?.[0]?.text || '{}');
          console.log('✅ Search results:', searchResults.results?.length || 0, 'results found');
          console.log('✅ Character usage:', searchResults.usage?.charactersUsed || 0, 'chars');
        } catch (e) {
          console.log('📄 Raw search data (first 200 chars):', searchData.slice(0, 200) + '...');
        }
      }
    }
    
    reader.releaseLock();
    
    console.log('\n🎉 MCP over SSE test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
  } finally {
    // Kill the server
    console.log('\n🛑 Stopping server...');
    server.kill('SIGINT');
    process.exit(0);
  }
}

// Timeout after 30 seconds
setTimeout(() => {
  console.log('\n⏰ Test timeout reached');
  server.kill('SIGINT');
  process.exit(1);
}, 30000);

server.on('close', (code) => {
  console.log(`\n🏁 Server exited with code ${code}`);
});