import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { load as cheerioLoad } from 'cheerio';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.join(__dirname, '../../docs-repo');
const CACHE_DIR = path.join(__dirname, '../../.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'docs.json');
const META_FILE = path.join(CACHE_DIR, 'meta.json');
const REPO_URL = 'https://github.com/kynesyslabs/demosdk-api-ref.git';

// Lightweight stopword list to reduce noise in search scoring
const STOPWORDS = new Set([
  'a','an','and','are','as','at','be','but','by','for','if','in','into','is','it','no','not',
  'of','on','or','such','that','the','their','then','there','these','they','this','to','was',
  'will','with','we','you','your','from','about','what','when','where','which'
]);

interface DocPage {
  path: string;
  title: string;
  content: string;
  sections: Section[];
  module?: string;
  type: string;
  lastModified: string;
}

interface Section {
  id: string;
  title: string;
  content: string;
  level: number;
}

interface SearchResult {
  path: string;
  title: string;
  snippet: string;
  score: number;
  module?: string;
  type: string;
}

interface CacheMeta {
  lastCommit: string;
  lastUpdate: string;
  totalPages: number;
}

export class GitDocumentationService {
  private cache: Map<string, DocPage> = new Map();
  private searchIndex: Map<string, Set<string>> = new Map();
  private termFreqs: Map<string, Map<string, number>> = new Map();
  private docFreq: Map<string, number> = new Map();
  private totalDocs = 0;
  private initialized = false;
  private meta: CacheMeta = { lastCommit: '', lastUpdate: '', totalPages: 0 };

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Ensure repo exists and is up to date
      await this.ensureRepo();
      
      // Load or build cache
      await this.loadOrBuildCache();
      
      this.buildSearchIndex();
      this.initialized = true;
      
      console.error(`✅ Documentation service initialized with ${this.cache.size} pages`);
    } catch (error) {
      console.error('Failed to initialize documentation service:', error);
      throw error;
    }
  }

  private async ensureRepo(): Promise<void> {
    try {
      const repoExists = await fs.access(REPO_DIR).then(() => true).catch(() => false);
      
      if (!repoExists) {
        console.error(`🔄 Cloning repository from ${REPO_URL}...`);
        execSync(`git clone ${REPO_URL} "${REPO_DIR}"`, { stdio: 'inherit' });
      } else {
        console.error('📡 Updating repository...');
        execSync('git pull origin main', { cwd: REPO_DIR, stdio: 'inherit' });
      }
    } catch (error) {
      throw new Error(`Failed to clone/update repository: ${error}`);
    }
  }

  private async getCurrentCommit(): Promise<string> {
    try {
      return execSync('git rev-parse HEAD', { cwd: REPO_DIR, encoding: 'utf8' }).trim();
    } catch (error) {
      return '';
    }
  }

  private async loadOrBuildCache(): Promise<void> {
    const currentCommit = await this.getCurrentCommit();
    
    try {
      // Try to load existing cache and meta
      const [cacheData, metaData] = await Promise.all([
        fs.readFile(CACHE_FILE, 'utf-8').then(data => JSON.parse(data)),
        fs.readFile(META_FILE, 'utf-8').then(data => JSON.parse(data))
      ]);
      
      this.meta = metaData;
      
      // Check if cache is still valid
      if (this.meta.lastCommit === currentCommit && cacheData) {
        console.error('📋 Loading documentation from cache...');
        for (const [key, value] of Object.entries(cacheData)) {
          this.cache.set(key, value as DocPage);
        }
        return;
      }
    } catch (error) {
      // Cache doesn't exist or is invalid, will rebuild
      console.error('🔄 Cache invalid or missing, rebuilding...');
    }

    // Rebuild cache
    await this.buildCache();
    this.meta = {
      lastCommit: currentCommit,
      lastUpdate: new Date().toISOString(),
      totalPages: this.cache.size
    };
    
    await this.saveCache();
  }

  private async buildCache(): Promise<void> {
    this.cache.clear();
    
    // Find all HTML files in the repo
    const htmlFiles = await this.findHtmlFiles(REPO_DIR);
    console.error(`📄 Found ${htmlFiles.length} HTML files to process`);
    
    let processed = 0;
    for (const filePath of htmlFiles) {
      try {
        const relativePath = path.relative(REPO_DIR, filePath);
        const html = await fs.readFile(filePath, 'utf-8');
        const stats = await fs.stat(filePath);
        
        const page = this.parsePage(relativePath, html, stats.mtime.toISOString());
        if (page) {
          this.cache.set(relativePath, page);
        }
        
        processed++;
        if (processed % 50 === 0) {
          console.error(`✓ Processed ${processed}/${htmlFiles.length} files`);
        }
      } catch (error) {
        console.error(`Failed to process ${filePath}:`, error);
      }
    }
    
    console.error(`🎉 Successfully processed ${this.cache.size} pages`);
  }

  private async findHtmlFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    
    async function scan(currentDir: string) {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          await scan(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.html')) {
          files.push(fullPath);
        }
      }
    }
    
    await scan(dir);
    return files;
  }

  private parsePage(relativePath: string, html: string, lastModified: string): DocPage | null {
    try {
      const $ = cheerioLoad(html);
      
      // Extract title
      const title = $('h1').first().text().trim() || 
                   $('title').text().trim() || 
                   path.basename(relativePath, '.html');

      // Extract main content (avoid navigation and search elements)
      const mainContent = $('.tsd-panel-group, .tsd-comment, .tsd-description, article, main').first();
      let content = '';
      
      if (mainContent.length) {
        // Remove navigation, search, and other UI elements
        mainContent.find('.tsd-navigation, .tsd-search, .tsd-toolbar, script, style').remove();
        content = mainContent.text().trim();
      } else {
        // Fallback to body content
        const body = $('body').clone();
        body.find('.tsd-navigation, .tsd-search, .tsd-toolbar, script, style, nav, header').remove();
        content = body.text().trim();
      }

      // Extract sections from headings
      const sections: Section[] = [];
      $('h1, h2, h3, h4, h5, h6').each((_, elem) => {
        const $elem = $(elem);
        const level = parseInt(elem.tagName.substring(1));
        const sectionTitle = $elem.text().trim();
        
        if (!sectionTitle) return;
        
        const id = $elem.attr('id') || 
                  $elem.find('[id]').first().attr('id') ||
                  sectionTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        
        // Get content until next heading of same or higher level
        let sectionContent = '';
        let current = $elem.next();
        
        while (current.length) {
          const isHeading = current.is('h1, h2, h3, h4, h5, h6');
          if (isHeading) {
            const tagName = current.prop('tagName');
            const currentLevel = tagName ? parseInt(tagName.substring(1)) : level + 1;
            if (currentLevel <= level) break;
          }
          
          if (!isHeading) {
            sectionContent += current.text().trim() + '\n';
          }
          current = current.next();
        }
        
        sections.push({
          id,
          title: sectionTitle,
          content: sectionContent.trim(),
          level,
        });
      });

      // Determine page type and module
      const type = this.getPageType(relativePath);
      const module = this.extractModule(relativePath);

      return {
        path: relativePath,
        title,
        content: content.substring(0, 20000), // Limit content size
        sections,
        module,
        type,
        lastModified,
      };
    } catch (error) {
      console.error(`Failed to parse ${relativePath}:`, error);
      return null;
    }
  }

  private getPageType(filePath: string): string {
    const pathLower = filePath.toLowerCase();
    if (pathLower.includes('classes/')) return 'class';
    if (pathLower.includes('interfaces/')) return 'interface';
    if (pathLower.includes('modules/')) return 'module';
    if (pathLower.includes('functions/')) return 'function';
    if (pathLower.includes('enums/')) return 'enum';
    if (pathLower.includes('types/')) return 'type';
    if (pathLower.includes('variables/')) return 'variable';
    if (pathLower === 'index.html') return 'index';
    return 'other';
  }

  private extractModule(filePath: string): string | undefined {
    const parts = filePath.split('/');
    if (parts.length >= 2) {
      if (parts[0] === 'modules') {
        return parts[1]?.replace('.html', '');
      } else if (parts.length >= 2 && ['classes', 'interfaces', 'functions'].includes(parts[0])) {
        // Extract module from class names like "websdk.Demos.html"
        const fileName = parts[1]?.replace('.html', '');
        if (fileName) {
          const modulePart = fileName.split('.')[0];
          return modulePart;
        }
      }
    }
    return undefined;
  }

  private async saveCache(): Promise<void> {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    
    const cacheData = Object.fromEntries(this.cache);
    await Promise.all([
      fs.writeFile(CACHE_FILE, JSON.stringify(cacheData, null, 2)),
      fs.writeFile(META_FILE, JSON.stringify(this.meta, null, 2))
    ]);
  }

  private buildSearchIndex(): void {
    this.searchIndex.clear();
    this.termFreqs.clear();
    this.docFreq.clear();
    this.totalDocs = this.cache.size;
    
    for (const [path, page] of this.cache) {
      const words = this.tokenize(page.title + ' ' + page.content);
      const termCount = new Map<string, number>();
      const unique = new Set<string>();
      
      for (const word of words) {
        termCount.set(word, (termCount.get(word) || 0) + 1);
        unique.add(word);
      }

      // Inverted index
      for (const word of unique) {
        if (!this.searchIndex.has(word)) {
          this.searchIndex.set(word, new Set());
        }
        this.searchIndex.get(word)!.add(path);
        this.docFreq.set(word, (this.docFreq.get(word) || 0) + 1);
      }

      this.termFreqs.set(path, termCount);
    }
  }

  private tokenize(text: string): Set<string> {
    return new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 1 && !STOPWORDS.has(word))
    );
  }

  async search(
    query: string,
    options: { limit?: number; offset?: number; module?: string; type?: string } = {}
  ): Promise<{
    results: SearchResult[];
    total: number;
    offset: number;
    hasMore: boolean;
  }> {
    const { limit = 10, offset = 0, module, type } = options;
    const moduleFilter = module?.toLowerCase();
    const typeFilter = type?.toLowerCase();
    const queryWords = Array.from(this.tokenize(query));
    const scores = new Map<string, number>();

    // Early exit if nothing to search
    if (queryWords.length === 0) {
      return { results: [], total: 0, offset, hasMore: false };
    }

    // Calculate relevance scores with TF-IDF and field boosts
    for (const word of queryWords) {
      const paths = this.searchIndex.get(word);
      if (!paths) continue;

      const df = this.docFreq.get(word) || 1;
      const idf = Math.log((this.totalDocs + 1) / df) + 1;

      for (const path of paths) {
        const page = this.cache.get(path);
        if (!page) continue;
        if (moduleFilter && page.module?.toLowerCase() !== moduleFilter) continue;
        if (typeFilter && page.type.toLowerCase() !== typeFilter) continue;

        const termCount = this.termFreqs.get(path)?.get(word) || 0;
        const tf = termCount; // term frequency in document
        let score = (scores.get(path) || 0) + tf * idf;

        // Boost if the word appears in title or module
        const titleTokens = this.tokenize(page.title);
        if (titleTokens.has(word)) score += idf * 2;
        if (page.module && page.module.toLowerCase().includes(word)) score += idf;

        scores.set(path, score);
      }
    }

    // Phrase/title boosts
    const lowerQuery = query.toLowerCase();
    for (const [path, baseScore] of scores.entries()) {
      const page = this.cache.get(path);
      if (!page) continue;

      let score = baseScore;
      if (page.title.toLowerCase().includes(lowerQuery)) score += 5;
      if (page.content.toLowerCase().includes(lowerQuery)) score += 2;
      scores.set(path, score);
    }

    // Sort by score and create results
    const sortedPaths = Array.from(scores.entries()).sort((a, b) => b[1] - a[1]);

    const total = sortedPaths.length;
    const paginatedPaths = sortedPaths.slice(offset, offset + limit);

    const results: SearchResult[] = paginatedPaths.map(([path, score]) => {
      const page = this.cache.get(path)!;
      const snippet = this.extractSnippet(page.content, queryWords);
      
      return {
        path,
        title: page.title,
        snippet,
        score,
        module: page.module,
        type: page.type,
      };
    });

    return {
      results,
      total,
      offset,
      hasMore: offset + limit < total,
    };
  }

  private extractSnippet(content: string, queryWords: string[]): string {
    const lowerContent = content.toLowerCase();
    let bestIndex = -1;

    // Prefer exact phrase match if possible
    const phrase = queryWords.join(' ');
    if (phrase.length > 0) {
      bestIndex = lowerContent.indexOf(phrase);
    }

    // Otherwise pick first matching token
    if (bestIndex === -1) {
      for (const word of queryWords) {
        const idx = lowerContent.indexOf(word);
        if (idx !== -1) {
          bestIndex = idx;
          break;
        }
      }
    }

    // Fallback to start of content
    if (bestIndex === -1) {
      return content.substring(0, 220) + (content.length > 220 ? '...' : '');
    }

    const window = 200;
    const start = Math.max(0, bestIndex - window / 2);
    const end = Math.min(content.length, start + window);

    const snippet = content.substring(start, end).trim();
    const prefix = start > 0 ? '...' : '';
    const suffix = end < content.length ? '...' : '';
    return `${prefix}${snippet}${suffix}`;
  }

  async getPage(pagePath: string, section?: string): Promise<DocPage | null> {
    const page = this.cache.get(pagePath);
    if (!page) return null;

    if (section) {
      const sectionData = page.sections.find(
        s => s.id === section || s.title.toLowerCase() === section.toLowerCase()
      );
      
      if (sectionData) {
        return {
          ...page,
          content: sectionData.content,
          sections: [sectionData],
        };
      }
    }

    return page;
  }

  async listModules(options: { limit?: number; offset?: number } = {}): Promise<{
    modules: Array<{ name: string; path: string; type: string }>;
    total: number;
    offset: number;
    hasMore: boolean;
  }> {
    const { limit = 50, offset = 0 } = options;
    
    const modules = Array.from(this.cache.entries())
      .filter(([_, page]) => page.module || page.type === 'module')
      .map(([path, page]) => ({
        name: page.module || page.title,
        path,
        type: page.type,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const total = modules.length;
    const paginatedModules = modules.slice(offset, offset + limit);

    return {
      modules: paginatedModules,
      total,
      offset,
      hasMore: offset + limit < total,
    };
  }

  async getStats(): Promise<{
    totalPages: number;
    totalModules: number;
    lastUpdate: string;
    lastCommit: string;
    repoPath: string;
  }> {
    return {
      totalPages: this.cache.size,
      totalModules: Array.from(this.cache.values()).filter(p => p.module).length,
      lastUpdate: this.meta.lastUpdate,
      lastCommit: this.meta.lastCommit,
      repoPath: REPO_DIR,
    };
  }

  async updateDocumentation(): Promise<void> {
    console.error('🔄 Updating documentation...');
    await this.ensureRepo();
    await this.loadOrBuildCache();
    this.buildSearchIndex();
    console.error('✅ Documentation updated successfully');
  }
}
