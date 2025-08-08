#!/usr/bin/env node
import { GitDocumentationService } from '../services/git-docs.js';

async function main() {
  console.log('🚀 Initializing Demos SDK documentation from Git repository...');
  
  try {
    const docService = new GitDocumentationService();
    await docService.initialize();
    
    const stats = await docService.getStats();
    console.log('\n📊 Documentation initialized successfully!');
    console.log(`📄 Total pages: ${stats.totalPages}`);
    console.log(`📦 Total modules: ${stats.totalModules}`);
    console.log(`🔄 Last commit: ${stats.lastCommit.substring(0, 7)}`);
    console.log(`📅 Last update: ${new Date(stats.lastUpdate).toLocaleString()}`);
    console.log(`📁 Repository path: ${stats.repoPath}`);
  } catch (error) {
    console.error('❌ Failed to initialize documentation:', error);
    process.exit(1);
  }
}

main();