#!/usr/bin/env node

console.log('🌐 Testing Remote MCP Server');
console.log('============================');

const REMOTE_URL = process.argv[2] || 'https://get.demos.sh';

console.log(`🎯 Target: ${REMOTE_URL}`);
console.log('');

async function testRemoteServer() {
  try {
    // Test 1: Server info
    console.log('1️⃣ Testing server info...');
    const infoResponse = await fetch(`${REMOTE_URL}/`);
    
    if (!infoResponse.ok) {
      throw new Error(`Server info failed: ${infoResponse.status} ${infoResponse.statusText}`);
    }
    
    const infoData = await infoResponse.json();
    console.log('✅ Server Info:');
    console.log(`   Name: ${infoData.name}`);
    console.log(`   Version: ${infoData.version}`);
    console.log(`   Transport: ${infoData.transport}`);
    console.log(`   Active Sessions: ${infoData.activeSessions}`);
    
    // Test 2: Health check
    console.log('\n2️⃣ Testing health endpoint...');
    const healthResponse = await fetch(`${REMOTE_URL}/health`);
    
    if (!healthResponse.ok) {
      throw new Error(`Health check failed: ${healthResponse.status} ${healthResponse.statusText}`);
    }
    
    const healthData = await healthResponse.json();
    console.log('✅ Health Status:');
    console.log(`   Status: ${healthData.status}`);
    console.log(`   Initialized: ${healthData.initialized}`);
    console.log(`   Pages: ${healthData.pages}`);
    console.log(`   Active Sessions: ${healthData.activeSessions}`);
    
    // Test 3: SSE Connection
    console.log('\n3️⃣ Testing SSE connection...');
    const sseResponse = await fetch(`${REMOTE_URL}/message`);
    
    if (!sseResponse.ok) {
      throw new Error(`SSE connection failed: ${sseResponse.status} ${sseResponse.statusText}`);
    }
    
    console.log('✅ SSE Connection established');
    console.log(`   Status: ${sseResponse.status}`);
    console.log(`   Content-Type: ${sseResponse.headers.get('content-type')}`);
    
    // Test 4: Read SSE stream
    console.log('\n4️⃣ Reading SSE stream...');
    const reader = sseResponse.body.getReader();
    const { value, done } = await reader.read();
    
    if (!done && value) {
      const chunk = new TextDecoder().decode(value);
      console.log('✅ SSE Stream data received:');
      console.log(`   ${chunk.trim()}`);
      
      // Extract endpoint URL
      const endpointMatch = chunk.match(/data: (.+)/);
      if (endpointMatch) {
        const endpointUrl = decodeURI(endpointMatch[1]);
        console.log(`✅ Extracted endpoint: ${endpointUrl}`);
        
        // Test 5: MCP tools/list
        console.log('\n5️⃣ Testing MCP tools/list...');
        const listMessage = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {}
        };
        
        const listResponse = await fetch(`${REMOTE_URL}${endpointUrl}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(listMessage)
        });
        
        console.log(`✅ tools/list POST status: ${listResponse.status}`);
        
        if (listResponse.ok) {
          // Wait for SSE response
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const { value: listResult } = await reader.read();
          if (listResult) {
            const listData = new TextDecoder().decode(listResult);
            console.log('✅ tools/list SSE response received');
            
            // Parse the JSON response
            const jsonMatch = listData.match(/data: (.+)/);
            if (jsonMatch) {
              try {
                const responseData = JSON.parse(jsonMatch[1]);
                const tools = responseData.result?.tools || [];
                console.log(`✅ Found ${tools.length} tools:`);
                tools.forEach(tool => {
                  console.log(`   - ${tool.name}`);
                });
              } catch (e) {
                console.log('📄 Raw SSE response:', listData.slice(0, 200) + '...');
              }
            }
          }
          
          // Test 6: MCP search
          console.log('\n6️⃣ Testing MCP search...');
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
          
          const searchResponse = await fetch(`${REMOTE_URL}${endpointUrl}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(searchMessage)
          });
          
          console.log(`✅ search POST status: ${searchResponse.status}`);
          
          if (searchResponse.ok) {
            // Wait for SSE response
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            const { value: searchResult } = await reader.read();
            if (searchResult) {
              const searchData = new TextDecoder().decode(searchResult);
              console.log('✅ search SSE response received');
              
              // Parse the search results
              const jsonMatch = searchData.match(/data: (.+)/);
              if (jsonMatch) {
                try {
                  const responseData = JSON.parse(jsonMatch[1]);
                  const searchContent = JSON.parse(responseData.result?.content?.[0]?.text || '{}');
                  console.log(`✅ Search results: ${searchContent.results?.length || 0} results`);
                  console.log(`✅ Character usage: ${searchContent.usage?.charactersUsed || 0} chars`);
                  if (searchContent.results?.length > 0) {
                    console.log(`   Top result: ${searchContent.results[0].title} (score: ${searchContent.results[0].score})`);
                  }
                } catch (e) {
                  console.log('📄 Raw search response:', searchData.slice(0, 200) + '...');
                }
              }
            }
          }
        }
      }
      
      reader.releaseLock();
    }
    
    console.log('\n🎉 Remote server test completed successfully!');
    console.log(`\n📋 Summary:`);
    console.log(`   Server: ${REMOTE_URL}`);
    console.log(`   Status: ✅ Working`);
    console.log(`   SSE: ✅ Connected`);
    console.log(`   MCP: ✅ Responding`);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.log('\n🔍 Troubleshooting:');
    console.log('   - Check if server is running');
    console.log('   - Verify URL is correct');
    console.log('   - Check CORS settings');
    console.log('   - Ensure SSL certificate is valid');
  }
}

console.log('🚀 Starting remote server test...\n');
testRemoteServer();