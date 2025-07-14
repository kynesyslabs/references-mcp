import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import * as cheerio from 'cheerio';
import { watch } from 'chokidar';
import { ParsedPage, ParseResult, ParseError, ParserConfig, ParserState, CodeBlock, PageMetadata, Heading } from './types.js';

export class TypeDocParser {
  private config: ParserConfig;
  private state: ParserState;
  private pages: Map<string, ParsedPage> = new Map();
  private watcher?: any;

  constructor(config: ParserConfig) {
    this.config = config;
    this.state = {
      discovered: new Set(),
      parsed: new Set(),
      failed: new Set(),
      queue: [],
      inProgress: new Set()
    };
  }

  async parseAll(): Promise<ParseResult> {
    const startTime = Date.now();
    const errors: ParseError[] = [];

    try {
      await this.discoverFiles();
      await this.parseFiles();
    } catch (error) {
      errors.push({
        filePath: 'global',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      });
    }

    const parseTime = Date.now() - startTime;
    
    return {
      pages: Array.from(this.pages.values()),
      errors,
      totalPages: this.pages.size,
      parseTime
    };
  }

  private async discoverFiles(): Promise<void> {
    const htmlFiles = await this.findHtmlFiles(this.config.basePath);
    
    for (const file of htmlFiles) {
      if (this.shouldIncludeFile(file)) {
        this.state.discovered.add(file);
        this.state.queue.push(file);
      }
    }
  }

  private async findHtmlFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    
    const items = await fs.promises.readdir(dir, { withFileTypes: true });
    
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      
      if (item.isDirectory()) {
        files.push(...await this.findHtmlFiles(fullPath));
      } else if (item.isFile() && item.name.endsWith('.html')) {
        files.push(fullPath);
      }
    }
    
    return files;
  }

  private shouldIncludeFile(filePath: string): boolean {
    const relativePath = path.relative(this.config.basePath, filePath);
    
    // Check exclude patterns
    for (const pattern of this.config.excludePatterns) {
      if (relativePath.includes(pattern)) {
        return false;
      }
    }
    
    // Check include patterns (if any)
    if (this.config.includePatterns.length > 0) {
      return this.config.includePatterns.some(pattern => 
        relativePath.includes(pattern)
      );
    }
    
    return true;
  }

  private async parseFiles(): Promise<void> {
    for (const filePath of this.state.queue) {
      if (this.state.inProgress.has(filePath)) continue;
      
      this.state.inProgress.add(filePath);
      
      try {
        const page = await this.parseFile(filePath);
        this.pages.set(filePath, page);
        this.state.parsed.add(filePath);
      } catch (error) {
        this.state.failed.add(filePath);
        console.error(`Failed to parse ${filePath}:`, error);
      } finally {
        this.state.inProgress.delete(filePath);
      }
    }
  }

  private async parseFile(filePath: string): Promise<ParsedPage> {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const stats = await fs.promises.stat(filePath);
    const hash = createHash('sha256').update(content).digest('hex');
    const relativePath = path.relative(this.config.basePath, filePath);
    
    const $ = cheerio.load(content);
    
    // Extract basic info
    const title = $('title').text().replace(' | @kynesyslabs/demosdk', '');
    const type = this.determinePageType(relativePath);
    
    // Extract text content
    const textContent = this.extractTextContent($);
    
    // Extract code blocks
    const codeBlocks = this.extractCodeBlocks($);
    
    // Extract metadata
    const metadata = this.extractMetadata($, type);
    
    // Parse module/class/function names from path
    const { moduleName, className, functionName } = this.parseNamesFromPath(relativePath);

    return {
      filePath,
      relativePath,
      title,
      content: textContent,
      type,
      moduleName,
      className,
      functionName,
      lastModified: stats.mtime,
      hash,
      codeBlocks,
      metadata
    };
  }

  private determinePageType(relativePath: string): ParsedPage['type'] {
    if (relativePath === 'index.html') return 'index';
    if (relativePath === 'modules.html') return 'modules';
    if (relativePath.startsWith('modules/')) return 'module';
    if (relativePath.startsWith('classes/')) return 'class';
    if (relativePath.startsWith('interfaces/')) return 'interface';
    if (relativePath.startsWith('functions/')) return 'function';
    if (relativePath.startsWith('enums/')) return 'enum';
    if (relativePath.startsWith('types/')) return 'type';
    if (relativePath.startsWith('variables/')) return 'variable';
    return 'index';
  }

  private extractTextContent($: cheerio.CheerioAPI): string {
    // Remove script tags and style tags
    $('script, style').remove();
    
    // Extract main content
    const mainContent = $('.col-content').text() || $('body').text();
    
    // Clean up whitespace
    return mainContent.replace(/\s+/g, ' ').trim();
  }

  private extractCodeBlocks($: cheerio.CheerioAPI): CodeBlock[] {
    const codeBlocks: CodeBlock[] = [];
    
    $('pre code').each((_, element) => {
      const $code = $(element);
      const code = $code.text().trim();
      
      // Try to determine language from class names
      const className = $code.attr('class') || '';
      const languageMatch = className.match(/language-(\w+)/) || className.match(/(\w+)/);
      const language = languageMatch ? languageMatch[1] : 'text';
      
      // Get context from parent elements
      const context = $code.closest('section').find('h1, h2, h3, h4').first().text().trim();
      
      if (code) {
        codeBlocks.push({
          language,
          code,
          context: context || undefined
        });
      }
    });
    
    return codeBlocks;
  }

  private extractMetadata($: cheerio.CheerioAPI, type: ParsedPage['type']): PageMetadata {
    const headings: Heading[] = [];
    const functions: string[] = [];
    const classes: string[] = [];
    const interfaces: string[] = [];
    const types: string[] = [];
    const exports: string[] = [];

    // Extract headings
    $('h1, h2, h3, h4, h5, h6').each((_, element) => {
      const $heading = $(element);
      const level = parseInt($heading.prop('tagName')?.substring(1) || '1');
      const text = $heading.text().trim();
      const id = $heading.attr('id');
      
      if (text) {
        headings.push({ level, text, id });
      }
    });

    // Extract function names from signatures
    $('.tsd-signature .tsd-kind-call-signature').each((_, element) => {
      const funcName = $(element).text().trim().split('(')[0];
      if (funcName) functions.push(funcName);
    });

    // Extract class names
    if (type === 'class') {
      const className = $('h1').text().replace('Class ', '').trim();
      if (className) classes.push(className);
    }

    // Extract interface names
    if (type === 'interface') {
      const interfaceName = $('h1').text().replace('Interface ', '').trim();
      if (interfaceName) interfaces.push(interfaceName);
    }

    // Extract type names
    if (type === 'type') {
      const typeName = $('h1').text().replace('Type ', '').trim();
      if (typeName) types.push(typeName);
    }

    // Extract exports from breadcrumbs
    $('.tsd-breadcrumb a').each((_, element) => {
      const exportName = $(element).text().trim();
      if (exportName && exportName !== '@kynesyslabs/demosdk') {
        exports.push(exportName);
      }
    });

    return {
      headings,
      functions,
      classes,
      interfaces,
      types,
      exports
    };
  }

  private parseNamesFromPath(relativePath: string): {
    moduleName?: string;
    className?: string;
    functionName?: string;
  } {
    const parts = relativePath.split('/');
    const fileName = parts[parts.length - 1].replace('.html', '');
    
    let moduleName: string | undefined;
    let className: string | undefined;
    let functionName: string | undefined;

    if (fileName.includes('.')) {
      const nameParts = fileName.split('.');
      moduleName = nameParts[0];
      
      if (relativePath.startsWith('classes/')) {
        className = nameParts[1];
      } else if (relativePath.startsWith('functions/')) {
        functionName = nameParts[1];
      }
    } else if (relativePath.startsWith('modules/')) {
      moduleName = fileName;
    }

    return { moduleName, className, functionName };
  }

  startWatching(): void {
    if (!this.config.watchFiles) return;
    
    this.watcher = watch(path.join(this.config.basePath, '**/*.html'), {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true
    });

    this.watcher
      ?.on('change', (filePath: string) => this.handleFileChange(filePath))
      ?.on('add', (filePath: string) => this.handleFileAdd(filePath))
      ?.on('unlink', (filePath: string) => this.handleFileRemove(filePath));
  }

  private async handleFileChange(filePath: string): Promise<void> {
    if (this.shouldIncludeFile(filePath)) {
      try {
        const page = await this.parseFile(filePath);
        this.pages.set(filePath, page);
        console.log(`Updated: ${filePath}`);
      } catch (error) {
        console.error(`Failed to update ${filePath}:`, error);
      }
    }
  }

  private async handleFileAdd(filePath: string): Promise<void> {
    if (this.shouldIncludeFile(filePath)) {
      try {
        const page = await this.parseFile(filePath);
        this.pages.set(filePath, page);
        console.log(`Added: ${filePath}`);
      } catch (error) {
        console.error(`Failed to add ${filePath}:`, error);
      }
    }
  }

  private handleFileRemove(filePath: string): void {
    if (this.pages.has(filePath)) {
      this.pages.delete(filePath);
      console.log(`Removed: ${filePath}`);
    }
  }

  stopWatching(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = undefined;
    }
  }

  getPages(): ParsedPage[] {
    return Array.from(this.pages.values());
  }

  getPage(filePath: string): ParsedPage | undefined {
    return this.pages.get(filePath);
  }

  getPagesByType(type: ParsedPage['type']): ParsedPage[] {
    return Array.from(this.pages.values()).filter(page => page.type === type);
  }

  getPagesByModule(moduleName: string): ParsedPage[] {
    return Array.from(this.pages.values()).filter(page => page.moduleName === moduleName);
  }
}