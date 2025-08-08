import { GitDocumentationService } from './git-docs.js';

export class UpdateScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private docService: GitDocumentationService;

  constructor(docService: GitDocumentationService) {
    this.docService = docService;
  }

  start(): void {
    // Run every 6 hours (6 * 60 * 60 * 1000 ms)
    const SIX_HOURS = 6 * 60 * 60 * 1000;
    
    console.error('⏰ Starting documentation update scheduler (every 6 hours)');
    
    this.intervalId = setInterval(async () => {
      try {
        console.error('🔄 Running scheduled documentation update...');
        await this.docService.updateDocumentation();
        console.error('✅ Scheduled documentation update completed');
      } catch (error) {
        console.error('❌ Scheduled documentation update failed:', error);
      }
    }, SIX_HOURS);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.error('⏰ Documentation update scheduler stopped');
    }
  }
}