import { ParsedPage } from './types.js';

export interface SearchResult {
  page: ParsedPage;
  score: number;
  matches: SearchMatch[];
}

export interface SearchMatch {
  field: string;
  snippet: string;
  position: number;
}

export interface SearchOptions {
  limit?: number;
  offset?: number;
  type?: ParsedPage['type'];
  moduleName?: string;
  includeContent?: boolean;
  fuzzyMatch?: boolean;
}

export class DocumentSearcher {
  private pages: ParsedPage[] = [];
  private index: Map<string, Set<number>> = new Map();
  private stemmer: Map<string, string> = new Map();

  constructor(pages: ParsedPage[]) {
    this.pages = pages;
    this.buildIndex();
  }

  private buildIndex(): void {
    this.index.clear();
    this.stemmer.clear();

    this.pages.forEach((page, pageIndex) => {
      // Index title
      this.indexText(page.title, pageIndex, 'title');
      
      // Index content
      this.indexText(page.content, pageIndex, 'content');
      
      // Index module name
      if (page.moduleName) {
        this.indexText(page.moduleName, pageIndex, 'module');
      }
      
      // Index class name
      if (page.className) {
        this.indexText(page.className, pageIndex, 'class');
      }
      
      // Index function name
      if (page.functionName) {
        this.indexText(page.functionName, pageIndex, 'function');
      }
      
      // Index metadata
      page.metadata.functions.forEach(func => {
        this.indexText(func, pageIndex, 'function');
      });
      
      page.metadata.classes.forEach(cls => {
        this.indexText(cls, pageIndex, 'class');
      });
      
      page.metadata.interfaces.forEach(iface => {
        this.indexText(iface, pageIndex, 'interface');
      });
      
      page.metadata.types.forEach(type => {
        this.indexText(type, pageIndex, 'type');
      });
      
      // Index headings
      page.metadata.headings.forEach(heading => {
        this.indexText(heading.text, pageIndex, 'heading');
      });
      
      // Index code blocks
      page.codeBlocks.forEach(block => {
        this.indexText(block.code, pageIndex, 'code');
        if (block.context) {
          this.indexText(block.context, pageIndex, 'context');
        }
      });
    });
  }

  private indexText(text: string, pageIndex: number, field: string): void {
    const tokens = this.tokenize(text);
    
    tokens.forEach(token => {
      const key = `${field}:${token}`;
      if (!this.index.has(key)) {
        this.index.set(key, new Set());
      }
      this.index.get(key)!.add(pageIndex);
      
      // Also index without field prefix for general search
      if (!this.index.has(token)) {
        this.index.set(token, new Set());
      }
      this.index.get(token)!.add(pageIndex);
    });
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 1)
      .map(token => this.stem(token));
  }

  private stem(word: string): string {
    if (this.stemmer.has(word)) {
      return this.stemmer.get(word)!;
    }
    
    let stemmed = word;
    
    // Simple stemming rules
    if (word.endsWith('ing')) {
      stemmed = word.slice(0, -3);
    } else if (word.endsWith('ed')) {
      stemmed = word.slice(0, -2);
    } else if (word.endsWith('er')) {
      stemmed = word.slice(0, -2);
    } else if (word.endsWith('s') && word.length > 3) {
      stemmed = word.slice(0, -1);
    }
    
    this.stemmer.set(word, stemmed);
    return stemmed;
  }

  search(query: string, options: SearchOptions = {}): SearchResult[] {
    const {
      limit = 10,
      offset = 0,
      type,
      moduleName,
      includeContent = false,
      fuzzyMatch = false
    } = options;

    const tokens = this.tokenize(query);
    const scores: Map<number, number> = new Map();
    const matches: Map<number, SearchMatch[]> = new Map();

    // Find matching pages
    tokens.forEach(token => {
      const exactMatches = this.index.get(token) || new Set();
      
      // Add fuzzy matches if enabled
      let fuzzyMatches = new Set<number>();
      if (fuzzyMatch) {
        fuzzyMatches = this.findFuzzyMatches(token);
      }
      
      const allMatches = new Set([...exactMatches, ...fuzzyMatches]);
      
      allMatches.forEach(pageIndex => {
        const page = this.pages[pageIndex];
        if (!page) return;
        
        // Apply filters
        if (type && page.type !== type) return;
        if (moduleName && page.moduleName !== moduleName) return;
        
        // Calculate score
        const score = this.calculateScore(page, token, query);
        scores.set(pageIndex, (scores.get(pageIndex) || 0) + score);
        
        // Find matches
        const pageMatches = this.findMatches(page, token);
        if (!matches.has(pageIndex)) {
          matches.set(pageIndex, []);
        }
        matches.get(pageIndex)!.push(...pageMatches);
      });
    });

    // Sort by score and apply pagination
    const sortedResults = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(offset, offset + limit)
      .map(([pageIndex, score]) => {
        const page = this.pages[pageIndex];
        return {
          page: includeContent ? page : this.stripContent(page),
          score,
          matches: matches.get(pageIndex) || []
        };
      });

    return sortedResults;
  }

  private findFuzzyMatches(token: string): Set<number> {
    const matches = new Set<number>();
    let checkedCount = 0;
    const maxChecks = 1000; // Limit fuzzy search scope to prevent timeouts
    
    for (const [indexToken, pageIndexes] of this.index.entries()) {
      // Early termination to prevent O(n²) complexity
      if (checkedCount++ > maxChecks) break;
      
      // Skip if token length difference is too large (quick filter)
      if (Math.abs(token.length - indexToken.length) > 2) continue;
      
      if (this.fuzzyMatch(token, indexToken)) {
        pageIndexes.forEach(pageIndex => matches.add(pageIndex));
      }
    }
    
    return matches;
  }

  private fuzzyMatch(token1: string, token2: string): boolean {
    // Quick exact match check
    if (token1 === token2) return true;
    
    // Skip very short tokens to avoid noise
    if (token1.length < 3 || token2.length < 3) return false;
    
    const maxDistance = Math.max(1, Math.floor(token1.length / 3));
    return this.levenshteinDistance(token1, token2) <= maxDistance;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
    
    for (let i = 0; i <= str1.length; i++) {
      matrix[0][i] = i;
    }
    
    for (let j = 0; j <= str2.length; j++) {
      matrix[j][0] = j;
    }
    
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  private calculateScore(page: ParsedPage, token: string, originalQuery: string): number {
    let score = 0;
    
    // Title matches get highest score
    if (page.title.toLowerCase().includes(token)) {
      score += 10;
    }
    
    // Exact title match gets bonus
    if (page.title.toLowerCase() === originalQuery.toLowerCase()) {
      score += 20;
    }
    
    // Module name matches
    if (page.moduleName?.toLowerCase().includes(token)) {
      score += 8;
    }
    
    // Class name matches
    if (page.className?.toLowerCase().includes(token)) {
      score += 8;
    }
    
    // Function name matches
    if (page.functionName?.toLowerCase().includes(token)) {
      score += 8;
    }
    
    // Metadata matches
    page.metadata.functions.forEach(func => {
      if (func.toLowerCase().includes(token)) score += 5;
    });
    
    page.metadata.classes.forEach(cls => {
      if (cls.toLowerCase().includes(token)) score += 5;
    });
    
    page.metadata.interfaces.forEach(iface => {
      if (iface.toLowerCase().includes(token)) score += 5;
    });
    
    page.metadata.types.forEach(type => {
      if (type.toLowerCase().includes(token)) score += 5;
    });
    
    // Heading matches
    page.metadata.headings.forEach(heading => {
      if (heading.text.toLowerCase().includes(token)) {
        score += Math.max(1, 6 - heading.level); // Higher level headings get more score
      }
    });
    
    // Content matches (lower score)
    const contentMatches = (page.content.toLowerCase().match(new RegExp(token, 'g')) || []).length;
    score += Math.min(contentMatches, 3); // Cap content matches to avoid spam
    
    // Code matches
    page.codeBlocks.forEach(block => {
      if (block.code.toLowerCase().includes(token)) {
        score += 3;
      }
    });
    
    // Boost score for exact type matches
    if (page.type === 'class' && originalQuery.toLowerCase().includes('class')) score += 2;
    if (page.type === 'function' && originalQuery.toLowerCase().includes('function')) score += 2;
    if (page.type === 'interface' && originalQuery.toLowerCase().includes('interface')) score += 2;
    
    return score;
  }

  private findMatches(page: ParsedPage, token: string): SearchMatch[] {
    const matches: SearchMatch[] = [];
    
    // Title matches
    if (page.title.toLowerCase().includes(token)) {
      matches.push({
        field: 'title',
        snippet: this.createSnippet(page.title, token),
        position: page.title.toLowerCase().indexOf(token)
      });
    }
    
    // Content matches
    const contentIndex = page.content.toLowerCase().indexOf(token);
    if (contentIndex !== -1) {
      matches.push({
        field: 'content',
        snippet: this.createSnippet(page.content, token, contentIndex),
        position: contentIndex
      });
    }
    
    // Code matches
    page.codeBlocks.forEach((block, index) => {
      if (block.code.toLowerCase().includes(token)) {
        matches.push({
          field: 'code',
          snippet: this.createSnippet(block.code, token),
          position: block.code.toLowerCase().indexOf(token)
        });
      }
    });
    
    return matches;
  }

  private createSnippet(text: string, token: string, position?: number): string {
    const snippetLength = 150;
    const actualPosition = position ?? text.toLowerCase().indexOf(token.toLowerCase());
    
    if (actualPosition === -1) return text.slice(0, snippetLength) + '...';
    
    const start = Math.max(0, actualPosition - snippetLength / 2);
    const end = Math.min(text.length, start + snippetLength);
    
    let snippet = text.slice(start, end);
    
    if (start > 0) snippet = '...' + snippet;
    if (end < text.length) snippet = snippet + '...';
    
    return snippet;
  }

  private stripContent(page: ParsedPage): ParsedPage {
    return {
      ...page,
      content: page.content.slice(0, 200) + '...',
      // Also strip large code blocks and metadata for memory efficiency
      codeBlocks: page.codeBlocks.map(block => ({
        ...block,
        code: block.code.length > 500 ? block.code.slice(0, 500) + '...' : block.code
      })),
      metadata: {
        ...page.metadata,
        // Keep essential metadata but truncate large arrays
        functions: page.metadata.functions.slice(0, 10),
        classes: page.metadata.classes.slice(0, 10),
        interfaces: page.metadata.interfaces.slice(0, 10),
        types: page.metadata.types.slice(0, 10),
        exports: page.metadata.exports.slice(0, 10),
        headings: page.metadata.headings.slice(0, 20)
      }
    };
  }

  // Semantic search methods
  searchByType(type: ParsedPage['type'], limit: number = 10): ParsedPage[] {
    return this.pages
      .filter(page => page.type === type)
      .slice(0, limit);
  }

  searchByModule(moduleName: string, limit: number = 10): ParsedPage[] {
    return this.pages
      .filter(page => page.moduleName === moduleName)
      .slice(0, limit);
  }

  searchFunctions(query?: string, limit: number = 10): ParsedPage[] {
    let results = this.pages.filter(page => 
      page.type === 'function' || 
      page.metadata.functions.length > 0
    );
    
    if (query) {
      const lowerQuery = query.toLowerCase();
      results = results.filter(page => 
        page.functionName?.toLowerCase().includes(lowerQuery) ||
        page.metadata.functions.some(func => func.toLowerCase().includes(lowerQuery))
      );
    }
    
    return results.slice(0, limit);
  }

  searchClasses(query?: string, limit: number = 10): ParsedPage[] {
    let results = this.pages.filter(page => 
      page.type === 'class' || 
      page.metadata.classes.length > 0
    );
    
    if (query) {
      const lowerQuery = query.toLowerCase();
      results = results.filter(page => 
        page.className?.toLowerCase().includes(lowerQuery) ||
        page.metadata.classes.some(cls => cls.toLowerCase().includes(lowerQuery))
      );
    }
    
    return results.slice(0, limit);
  }

  getModules(): string[] {
    const modules = new Set<string>();
    this.pages.forEach(page => {
      if (page.moduleName) {
        modules.add(page.moduleName);
      }
    });
    return Array.from(modules).sort();
  }

  getStats(): {
    totalPages: number;
    pagesByType: Record<string, number>;
    moduleCount: number;
  } {
    const pagesByType: Record<string, number> = {};
    const modules = new Set<string>();
    
    this.pages.forEach(page => {
      pagesByType[page.type] = (pagesByType[page.type] || 0) + 1;
      if (page.moduleName) {
        modules.add(page.moduleName);
      }
    });
    
    return {
      totalPages: this.pages.length,
      pagesByType,
      moduleCount: modules.size
    };
  }
}