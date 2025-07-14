#!/usr/bin/env node
import { DemoSDKMCPServer } from './server.js';

async function main() {
  const server = new DemoSDKMCPServer();
  
  process.on('SIGINT', () => {
    console.log('Shutting down server...');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('Shutting down server...');
    process.exit(0);
  });

  try {
    await server.run();
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();