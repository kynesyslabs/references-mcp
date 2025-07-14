#!/usr/bin/env node

import { spawn } from 'child_process';

console.log('🧪 Testing SSE MCP Server');
console.log('=========================');

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
    runTests();
  }
});

server.stderr.on('data', (data) => {
  console.error('❌ Server Error:', data.toString());
});

async function runTests() {
  console.log('\n🚀 Starting tests...\n');
  
  try {
    // Test 1: Health check
    console.log('1️⃣ Testing health endpoint...');
    const healthResponse = await fetch('http://localhost:3000/health');
    const healthData = await healthResponse.json();
    console.log('✅ Health:', healthData);
    
    // Test 2: Server info
    console.log('\n2️⃣ Testing server info...');
    const infoResponse = await fetch('http://localhost:3000/');
    const infoData = await infoResponse.json();
    console.log('✅ Info:', infoData);
    
    // Test 3: Try to establish SSE connection
    console.log('\n3️⃣ Testing SSE endpoint...');
    const sseResponse = await fetch('http://localhost:3000/message');
    console.log('✅ SSE Response status:', sseResponse.status);
    console.log('✅ SSE Response headers:', Object.fromEntries(sseResponse.headers.entries()));
    
    // Test 4: Try to read the SSE stream
    if (sseResponse.body) {
      console.log('\n4️⃣ Reading SSE stream...');
      const reader = sseResponse.body.getReader();
      
      // Read first chunk (should contain endpoint event)
      const { value, done } = await reader.read();
      if (!done && value) {
        const chunk = new TextDecoder().decode(value);
        console.log('✅ SSE Stream data:', chunk);
        
        // Extract endpoint URL from SSE data
        const endpointMatch = chunk.match(/data: (.+)/);
        if (endpointMatch) {
          const endpointUrl = decodeURI(endpointMatch[1]);
          console.log('✅ Extracted endpoint:', endpointUrl);
          
          // Test 5: Try to send a test message
          console.log('\n5️⃣ Testing POST message...');
          try {
            const testMessage = {
              jsonrpc: '2.0',
              id: 1,
              method: 'tools/list',
              params: {}
            };
            
            const postResponse = await fetch(`http://localhost:3000${endpointUrl}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(testMessage)
            });
            
            console.log('✅ POST Response status:', postResponse.status);
            
            if (postResponse.ok) {
              const responseData = await postResponse.json();
              console.log('✅ POST Response:', JSON.stringify(responseData, null, 2));
            } else {
              console.log('❌ POST Response error:', await postResponse.text());
            }
          } catch (postError) {
            console.log('❌ POST Error:', postError.message);
          }
        }
      }
      
      reader.releaseLock();
    }
    
    console.log('\n🎉 All tests completed!');
    
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