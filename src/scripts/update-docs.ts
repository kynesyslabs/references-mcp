#!/usr/bin/env node
import { GitDocumentationService } from '../services/git-docs.js';

async function main() {
  console.log('🔄 Updating Demos SDK documentation...');
  
  try {
    const docService = new GitDocumentationService();
    await docService.updateDocumentation();
    
    const stats = await docService.getStats();
    console.log('\n📊 Documentation updated successfully!');
    console.log(`📄 Total pages: ${stats.totalPages}`);
    console.log(`📦 Total modules: ${stats.totalModules}`);
    console.log(`🔄 Last commit: ${stats.lastCommit.substring(0, 7)}`);
    console.log(`📅 Last update: ${new Date(stats.lastUpdate).toLocaleString()}`);
  } catch (error) {
    console.error('❌ Failed to update documentation:', error);
    process.exit(1);
  }
}

main();