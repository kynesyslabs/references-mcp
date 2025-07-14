export interface ParsedPage {
  filePath: string;
  relativePath: string;
  title: string;
  content: string;
  type: 'index' | 'modules' | 'module' | 'class' | 'function' | 'interface' | 'enum' | 'type' | 'variable';
  moduleName?: string;
  className?: string;
  functionName?: string;
  lastModified: Date;
  hash: string;
  codeBlocks: CodeBlock[];
  metadata: PageMetadata;
}

export interface CodeBlock {
  language: string;
  code: string;
  context?: string;
}

export interface PageMetadata {
  headings: Heading[];
  functions: string[];
  classes: string[];
  interfaces: string[];
  types: string[];
  exports: string[];
}

export interface Heading {
  level: number;
  text: string;
  id?: string;
}

export interface ParseResult {
  pages: ParsedPage[];
  errors: ParseError[];
  totalPages: number;
  parseTime: number;
}

export interface ParseError {
  filePath: string;
  error: string;
  timestamp: Date;
}

export interface ParserConfig {
  basePath: string;
  watchFiles: boolean;
  includePatterns: string[];
  excludePatterns: string[];
}

export interface ParserState {
  discovered: Set<string>;
  parsed: Set<string>;
  failed: Set<string>;
  queue: string[];
  inProgress: Set<string>;
}