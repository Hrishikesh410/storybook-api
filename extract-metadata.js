/**
 * ==============================================
 * GENERIC STORYBOOK METADATA EXTRACTOR
 * ==============================================
 * 
 * A portable, framework-agnostic solution to extract
 * complete metadata from any Storybook project.
 * 
 * Compatible with: Storybook 7.x, 8.x
 * Frameworks: React, Vue, Angular, Web Components, etc.
 * 
 * Usage:
 *   Development: node extract-metadata.js --dev
 *   Build:       node extract-metadata.js --build
 *   Enhanced:    node extract-metadata.js --build --enhance
 * 
 * Outputs: stories.json with complete story metadata
 * ==============================================
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parser imports (optional, for source file parsing)
let parser, traverse, babelTypes, glob;
try {
  parser = await import('@babel/parser');
  const babelTraverse = await import('@babel/traverse');
  const babelTypesModule = await import('@babel/types');
  const globModule = await import('glob');
  
  // Handle different export styles
  traverse = babelTraverse.default?.default || babelTraverse.default || babelTraverse;
  babelTypes = babelTypesModule.default || babelTypesModule;
  glob = globModule.glob || globModule.default;
} catch (err) {
  // Parser dependencies not installed - will fall back to other methods
  console.log('📝 Note: Install @babel/parser, @babel/traverse, and glob for source file parsing');
  console.log('   Error:', err.message);
}

// ============= AUTO-DETECTION =============

/**
 * Auto-detect which port Storybook is running on
 * Tries common Storybook ports and verifies the response
 * @returns {Promise<number|null>} The detected port or null
 */
async function detectStorybookPort() {
  const commonPorts = [6006, 6007, 6008, 6009, 9009, 9001, 8080];
  
  console.log('🔍 Auto-detecting Storybook port...');
  
  for (const port of commonPorts) {
    try {
      const url = `http://localhost:${port}`;
      
      // Use dynamic import for fetch in Node.js
      const response = await fetch(url, { 
        method: 'HEAD',
        signal: AbortSignal.timeout(1000) // 1 second timeout per port
      });
      
      if (response.ok) {
        // Additional check: verify it's actually Storybook
        try {
          const htmlResponse = await fetch(url, {
            signal: AbortSignal.timeout(1000)
          });
          const html = await htmlResponse.text();
          
          // Check if it's a Storybook page (look for telltale signs)
          if (html.toLowerCase().includes('storybook') || 
              html.includes('__STORYBOOK') ||
              html.includes('sb-')) {
            console.log(`✅ Found Storybook running on port ${port}`);
            return port;
          }
        } catch (e) {
          // Not Storybook or error fetching, continue to next port
        }
      }
    } catch (error) {
      // Port not responding or connection refused, try next
      continue;
    }
  }
  
  console.log('⚠️  Could not auto-detect Storybook port');
  console.log('💡 Specify port manually with --port=XXXX or STORYBOOK_PORT env var');
  return null;
}

// ============= CONFIGURATION =============
const CONFIG = {
  // Storybook dev server URL
  storybookUrl: process.env.STORYBOOK_URL || 'http://localhost:6006',
  
  // Output directory (relative to project root)
  outputDir: path.join(__dirname, '../storybook-static'),
  
  // Output filename
  outputFile: 'stories.json',
  
  // Timeout for waiting for Storybook to load (ms)
  timeout: 30000,
  
  // Browser launch options
  browserOptions: {
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  },
};

// ============= EXTRACTION FROM SOURCE FILES =============

/**
 * Extract metadata by parsing story source files directly
 * This is the BEST method - fast, complete, and doesn't need browser or running Storybook!
 * Gets: args, argTypes, parameters, documentation, source code, and more
 */
async function extractFromSourceFiles() {
  console.log('📂 Extracting metadata by parsing source files...');
  console.log('   This method gets complete args, argTypes, and parameters!');
  
  if (!parser || !traverse || !glob) {
    console.warn('⚠️  Parser dependencies not installed');
    console.warn('💡 Install with: npm install @babel/parser @babel/traverse glob');
    return null;
  }
  
  try {
    // Find project root (go up from .storybook directory)
    const projectRoot = path.join(__dirname, '..');
    const srcDir = path.join(projectRoot, 'src');
    
    if (!fs.existsSync(srcDir)) {
      console.error('❌ src directory not found at:', srcDir);
      return null;
    }
    
    // Find all story files
    console.log(`   Scanning for story files in: ${srcDir}`);
    const storyFiles = await glob('**/*.stories.{ts,tsx,js,jsx}', {
      cwd: srcDir,
      absolute: true,
      ignore: ['**/node_modules/**']
    });
    
    console.log(`   Found ${storyFiles.length} story files`);
    
    const metadata = createMetadataStructure('source-files');
    let processedStories = 0;
    
    for (const filePath of storyFiles) {
      try {
        const code = fs.readFileSync(filePath, 'utf-8');
        const relativePath = './' + path.relative(projectRoot, filePath);
        
        // Parse the TypeScript/JavaScript file
        const ast = parser.parse(code, {
          sourceType: 'module',
          plugins: ['typescript', 'jsx', 'decorators-legacy']
        });
        
        let metaExport = {
          title: '',
          component: null,
          argTypes: {},
          parameters: {},
        };
        const stories = {};
        
        // Traverse the AST to extract metadata
        traverse(ast, {
          ExportDefaultDeclaration(nodePath) {
            // Extract default export (Storybook Meta)
            const declaration = nodePath.node.declaration;
            metaExport = extractMetaObject(declaration);
          },
          
          ExportNamedDeclaration(nodePath) {
            // Extract named story exports
            const declaration = nodePath.node.declaration;
            if (declaration?.type === 'VariableDeclaration') {
              declaration.declarations.forEach(decl => {
                if (decl.id?.name) {
                  const storyName = decl.id.name;
                  stories[storyName] = {
                    name: storyName,
                    args: {},
                    storyName: storyName,
                  };
                }
              });
            } else if (declaration?.type === 'FunctionDeclaration' && declaration.id?.name) {
              const storyName = declaration.id.name;
              stories[storyName] = {
                name: storyName,
                args: {},
                storyName: storyName,
              };
            }
          },
          
          AssignmentExpression(nodePath) {
            // Extract Story.args = {...}
            const node = nodePath.node;
            if (node.left?.type === 'MemberExpression' && 
                node.left.property?.name === 'args' &&
                node.left.object?.name) {
              const storyName = node.left.object.name;
              const args = extractObjectLiteral(node.right);
              if (stories[storyName]) {
                stories[storyName].args = args;
              }
            }
            
            // Extract Story.storyName = "..."
            if (node.left?.type === 'MemberExpression' && 
                node.left.property?.name === 'storyName' &&
                node.left.object?.name) {
              const storyName = node.left.object.name;
              const displayName = node.right?.value;
              if (stories[storyName] && displayName) {
                stories[storyName].storyName = displayName;
              }
            }
          }
        });
        
        // Build complete metadata for each story in this file
        Object.entries(stories).forEach(([storyKey, storyData]) => {
          const storyId = generateStoryId(metaExport.title, storyKey);
          
          processedStories++;
          
          metadata.stories[storyId] = {
            id: storyId,
            title: metaExport.title || 'Unknown',
            name: storyData.storyName || storyKey,
            kind: metaExport.title || 'Unknown',
            story: storyData.storyName || storyKey,
            importPath: relativePath,
            type: 'story',
            tags: metaExport.tags || [],
            
            // DEEP METADATA from source parsing
            args: storyData.args || {},
            initialArgs: storyData.args || {},
            argTypes: metaExport.argTypes || {},
            parameters: metaExport.parameters || {},
            
            // Extract actions from args
            actions: extractActionsFromArgs(storyData.args, metaExport.argTypes),
            
            // Documentation
            docs: {
              description: metaExport.parameters?.docs?.description?.story ||
                          metaExport.parameters?.docs?.description?.component || '',
              sourceCode: code,
              mdx: metaExport.parameters?.docs?.page || '',
            },
            
            source: code,
            component: metaExport.component,
          };
        });
        
      } catch (err) {
        console.warn(`   ⚠️  Could not parse ${path.basename(filePath)}: ${err.message}`);
      }
    }
    
    metadata.totalStories = Object.keys(metadata.stories).length;
    console.log(`✅ Successfully parsed ${processedStories} stories with complete metadata!`);
    console.log(`   Including: args, argTypes, parameters, source code, and more`);
    
    return metadata;
    
  } catch (error) {
    console.error('❌ Error parsing source files:', error.message);
    return null;
  }
}

/**
 * Helper: Extract Storybook Meta object from AST node
 */
function extractMetaObject(node) {
  const meta = {
    title: '',
    component: null,
    argTypes: {},
    parameters: {},
    tags: [],
  };
  
  if (node?.type === 'ObjectExpression') {
    node.properties.forEach(prop => {
      if (prop.key?.name === 'title' && prop.value?.value) {
        meta.title = prop.value.value;
      } else if (prop.key?.name === 'argTypes' && prop.value?.type === 'ObjectExpression') {
        meta.argTypes = extractObjectLiteral(prop.value);
      } else if (prop.key?.name === 'parameters' && prop.value?.type === 'ObjectExpression') {
        meta.parameters = extractObjectLiteral(prop.value);
      } else if (prop.key?.name === 'tags' && prop.value?.type === 'ArrayExpression') {
        meta.tags = prop.value.elements.map(el => el.value).filter(Boolean);
      } else if (prop.key?.name === 'component') {
        meta.component = prop.value?.name || null;
      }
    });
  } else if (node?.type === 'TSAsExpression') {
    // Handle: {...} as Meta
    return extractMetaObject(node.expression);
  }
  
  return meta;
}

/**
 * Helper: Extract object literal from AST node
 */
function extractObjectLiteral(node) {
  const result = {};
  
  if (!node) return result;
  
  // Handle TSAsExpression: {...} as SomeType
  if (node.type === 'TSAsExpression') {
    return extractObjectLiteral(node.expression);
  }
  
  if (node.type !== 'ObjectExpression') return result;
  
  node.properties.forEach(prop => {
    if (!prop.key) return;
    
    const key = prop.key.name || prop.key.value;
    if (!key) return;
    
    // Extract the value
    if (prop.value) {
      result[key] = extractValue(prop.value);
    }
  });
  
  return result;
}

/**
 * Helper: Extract value from AST node
 */
function extractValue(node) {
  if (!node) return null;
  
  switch (node.type) {
    case 'StringLiteral':
      return node.value;
    case 'NumericLiteral':
      return node.value;
    case 'BooleanLiteral':
      return node.value;
    case 'NullLiteral':
      return null;
    case 'ObjectExpression':
      return extractObjectLiteral(node);
    case 'ArrayExpression':
      return node.elements.map(el => extractValue(el)).filter(v => v !== null);
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
      return '[Function]';
    case 'JSXElement':
    case 'JSXFragment':
      return '[JSX Element]';
    case 'Identifier':
      return node.name;
    case 'TSAsExpression':
      return extractValue(node.expression);
    default:
      return null;
  }
}

/**
 * Helper: Generate story ID from title and name
 */
function generateStoryId(title, name) {
  return `${title}--${name}`
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/\//g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/**
 * Helper: Extract actions from args (functions like onClick, onChange, etc.)
 */
function extractActionsFromArgs(args, argTypes) {
  const actions = {};
  
  Object.entries(args || {}).forEach(([key, value]) => {
    if (key.startsWith('on') || value === '[Function]') {
      actions[key] = {
        name: key,
        description: argTypes?.[key]?.description || '',
        action: key,
      };
    }
  });
  
  // Also check argTypes for action controls
  Object.entries(argTypes || {}).forEach(([key, config]) => {
    if (config.action || config.table?.category === 'events') {
      actions[key] = {
        name: key,
        description: config.description || '',
        action: typeof config.action === 'string' ? config.action : key,
      };
    }
  });
  
  return actions;
}

// ============= EXTRACTION FROM BUILT STORYBOOK =============

/**
 * Extract metadata from a built Storybook (index.json)
 * This provides basic metadata without requiring a running server
 */
async function extractFromBuiltStorybook() {
  console.log('📦 Extracting metadata from built Storybook...');
  
  const indexPath = path.join(CONFIG.outputDir, 'index.json');
  
  if (!fs.existsSync(indexPath)) {
    console.error('❌ index.json not found at:', indexPath);
    console.error('💡 Build Storybook first: npm run build-storybook');
    return null;
  }
  
  try {
    const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    const metadata = createMetadataStructure('built-storybook');
    
    // Extract from index.json entries
    Object.entries(indexData.entries || {}).forEach(([storyId, entry]) => {
      metadata.stories[storyId] = extractBasicStoryData(entry);
    });
    
    console.log(`✅ Extracted ${Object.keys(metadata.stories).length} stories from index.json`);
    return metadata;
    
  } catch (error) {
    console.error('❌ Error reading index.json:', error.message);
    return null;
  }
}

// ============= EXTRACTION FROM RUNNING STORYBOOK =============

/**
 * Extract BASIC metadata from Storybook 8.x's index.json endpoint
 * This gets story structure but not deep metadata (args, argTypes, etc.)
 */
async function extractBasicMetadataFromIndex() {
  console.log('📇 Fetching story list from Storybook index...');
  
  try {
    const response = await fetch(`${CONFIG.storybookUrl}/index.json`, {
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const indexData = await response.json();
    return indexData.entries || {};
    
  } catch (error) {
    console.error('❌ Error fetching index:', error.message);
    return null;
  }
}

/**
 * Extract DEEP metadata from Storybook using browser automation
 * This gets args, argTypes, actions, docs, source code, etc.
 */
async function extractDeepMetadataWithBrowser(storyEntries) {
  console.log('🔬 Extracting deep metadata using browser automation...');
  console.log('   This will get args, argTypes, actions, docs, and source code');
  
  let puppeteer;
  try {
    puppeteer = await import('puppeteer');
  } catch (err) {
    console.warn('⚠️  Puppeteer not installed - cannot use browser automation method');
    console.warn('💡 This method is slow and rarely needed. Use source file parsing instead!');
    console.warn('   Install Babel dependencies: npm install --save-dev @babel/parser @babel/traverse @babel/types glob');
    return null;
  }
  
  const browser = await puppeteer.default.launch(CONFIG.browserOptions);
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  
  try {
    const metadata = createMetadataStructure('running-storybook-deep');
    const storyIds = Object.keys(storyEntries);
    
    console.log(`   Processing ${storyIds.length} stories for deep metadata...`);
    
    // Navigate to Storybook once
    await page.goto(CONFIG.storybookUrl, { 
      waitUntil: 'networkidle2', 
      timeout: CONFIG.timeout 
    });
    
    // Wait for Storybook to be ready
    await page.waitForSelector('#storybook-preview-iframe', { timeout: 10000 });
    
    let processed = 0;
    const batchSize = 50; // Process in batches for progress updates
    
    for (const storyId of storyIds) {
      const entry = storyEntries[storyId];
      
      try {
        // Navigate to specific story in iframe
        const storyUrl = `${CONFIG.storybookUrl}/iframe.html?id=${storyId}&viewMode=story`;
        await page.goto(storyUrl, { waitUntil: 'domcontentloaded', timeout: 5000 });
        
        // Small delay for story to render
        await page.waitForTimeout(100);
        
        // Extract deep metadata for this story
        const storyData = await page.evaluate((sid) => {
          try {
            // Access Storybook's preview API
            const preview = window.__STORYBOOK_PREVIEW__;
            const store = window.__STORYBOOK_STORY_STORE__ || preview?.storyStore;
            
            if (!store) return null;
            
            // Try different methods to get story data
            let story = null;
            
            // Method 1: Direct store access
            if (typeof store.fromId === 'function') {
              story = store.fromId(sid);
            } else if (store.stories && store.stories[sid]) {
              story = store.stories[sid];
            } else if (typeof store.raw === 'function') {
              const allStories = store.raw();
              story = allStories.find(s => s.id === sid);
            }
            
            if (!story) return null;
            
            // Extract all available metadata
            return {
              args: story.args || story.initialArgs || {},
              initialArgs: story.initialArgs || {},
              argTypes: story.argTypes || {},
              parameters: story.parameters || {},
              tags: story.tags || [],
            };
            
          } catch (e) {
            return null;
          }
        }, storyId);
        
        // Build complete story object
        metadata.stories[storyId] = {
          // Basic info from index
          id: entry.id || storyId,
          title: entry.title || '',
          name: entry.name || '',
          kind: entry.title || '',
          story: entry.name || '',
          importPath: entry.importPath || '',
          type: entry.type || 'story',
          tags: storyData?.tags || entry.tags || [],
          
          // Deep metadata from browser
          args: storyData?.args || {},
          initialArgs: storyData?.initialArgs || {},
          argTypes: storyData?.argTypes || {},
          actions: extractActions(storyData?.argTypes || {}),
          
          // Documentation
          docs: {
            description: storyData?.parameters?.docs?.description?.story || 
                        storyData?.parameters?.docs?.description?.component || '',
            sourceCode: storyData?.parameters?.docs?.source?.code || 
                       storyData?.parameters?.storySource?.source || '',
            mdx: storyData?.parameters?.docs?.page || '',
          },
          
          // Source and parameters
          source: storyData?.parameters?.docs?.source?.code || '',
          parameters: {
            fileName: entry.importPath || '',
            ...storyData?.parameters,
          },
          component: storyData?.parameters?.component?.__docgenInfo || null,
        };
        
      } catch (err) {
        // If individual story fails, use basic data
        metadata.stories[storyId] = {
          id: entry.id || storyId,
          title: entry.title || '',
          name: entry.name || '',
          kind: entry.title || '',
          story: entry.name || '',
          importPath: entry.importPath || '',
          type: entry.type || 'story',
          tags: entry.tags || [],
          args: {},
          initialArgs: {},
          argTypes: {},
          actions: {},
          docs: { description: '', sourceCode: '', mdx: '' },
          source: '',
          parameters: { fileName: entry.importPath || '' },
          component: null,
        };
      }
      
      processed++;
      if (processed % batchSize === 0) {
        console.log(`   Processed ${processed}/${storyIds.length} stories...`);
      }
    }
    
    await browser.close();
    
    metadata.totalStories = Object.keys(metadata.stories).length;
    console.log(`✅ Deep metadata extraction complete for ${metadata.totalStories} stories`);
    
    return metadata;
    
  } catch (error) {
    await browser.close();
    console.error('❌ Error during deep extraction:', error.message);
    return null;
  }
}

/**
 * Helper: Extract actions from argTypes
 */
function extractActions(argTypes) {
  const actions = {};
  Object.entries(argTypes || {}).forEach(([key, value]) => {
    if (value?.action || key.startsWith('on') || value?.table?.category === 'events') {
      actions[key] = {
        name: key,
        description: value?.description || '',
        action: typeof value?.action === 'string' ? value.action : key,
      };
    }
  });
  return actions;
}

/**
 * Extract COMPLETE metadata from a running Storybook instance
 * This gets BOTH basic info AND deep metadata (args, argTypes, actions, docs, source)
 */
async function extractFromRunningStorybook() {
  console.log('🌐 Extracting COMPLETE metadata from running Storybook...');
  console.log(`📡 Connecting to ${CONFIG.storybookUrl}...`);
  
  // Step 1: Try source file parsing first (BEST method - fastest and most complete!)
  console.log('\n🎯 Attempting source file parsing (recommended method)...');
  const sourceMetadata = await extractFromSourceFiles();
  
  if (sourceMetadata && sourceMetadata.totalStories > 0) {
    console.log('✨ Source file parsing successful!');
    return sourceMetadata;
  }
  
  console.log('⚠️  Source file parsing not available, trying HTTP endpoint...\n');
  
  // Step 2: Get story list from index endpoint (fast)
  const storyEntries = await extractBasicMetadataFromIndex();
  
  if (!storyEntries || Object.keys(storyEntries).length === 0) {
    console.log('⚠️  Could not fetch story list, falling back to build extraction...');
    return extractFromBuiltStorybook();
  }
  
  console.log(`✅ Found ${Object.keys(storyEntries).length} stories`);
  
  // Step 2: Extract deep metadata for each story (slower but complete)
  const deepMetadata = await extractDeepMetadataWithBrowser(storyEntries);
  
  if (deepMetadata && deepMetadata.totalStories > 0) {
    return deepMetadata;
  }
  
  // Step 3: If deep extraction fails, return basic metadata
  console.log('⚠️  Deep extraction failed, using basic metadata only...');
  const metadata = createMetadataStructure('storybook-index-basic');
  
  Object.entries(storyEntries).forEach(([storyId, entry]) => {
    metadata.stories[storyId] = {
      id: entry.id || storyId,
      title: entry.title || '',
      name: entry.name || '',
      kind: entry.title || '',
      story: entry.name || '',
      importPath: entry.importPath || '',
      type: entry.type || 'story',
      tags: entry.tags || [],
      args: {},
      initialArgs: {},
      argTypes: {},
      actions: {},
      docs: { description: '', sourceCode: '', mdx: '' },
      source: '',
      parameters: { fileName: entry.importPath || '' },
      component: null,
    };
  });
  
  metadata.totalStories = Object.keys(metadata.stories).length;
  return metadata;
}

// ============= HELPER FUNCTIONS =============

/**
 * Create the base metadata structure
 */
function createMetadataStructure(source = 'unknown') {
  return {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    extractedFrom: source,
    totalStories: 0,
    stories: {},
  };
}

/**
 * Extract basic story data from index.json entry
 */
function extractBasicStoryData(entry) {
  return {
    id: entry.id || '',
    title: entry.title || '',
    name: entry.name || '',
    kind: entry.title || '',
    story: entry.name || '',
    importPath: entry.importPath || '',
    type: entry.type || 'story',
    tags: entry.tags || [],
    
    // Placeholders for enhanced data
    args: {},
    initialArgs: {},
    argTypes: {},
    actions: {},
    docs: { description: '' },
    source: '',
    parameters: {},
    component: null,
  };
}

/**
 * Save metadata to file
 */
function saveMetadata(metadata, outputPath) {
  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Update total count
  metadata.totalStories = Object.keys(metadata.stories).length;
  
  // Write file
  fs.writeFileSync(outputPath, JSON.stringify(metadata, null, 2), 'utf-8');
  
  console.log(`\n📁 Saved to: ${outputPath}`);
  console.log(`📊 Total stories: ${metadata.totalStories}`);
  console.log(`🕐 Generated at: ${metadata.generatedAt}`);
}

// ============= CLI INTERFACE =============

async function main() {
  const args = process.argv.slice(2);
  const mode = args.find(arg => arg.startsWith('--') && !arg.startsWith('--port') && !arg.startsWith('--deep')) || '--build';
  const shouldEnhance = args.includes('--enhance');
  const deepExtraction = args.includes('--deep'); // New flag for deep metadata extraction
  
  // Check for custom port argument
  const portArg = args.find(arg => arg.startsWith('--port='));
  if (portArg) {
    const port = portArg.split('=')[1];
    CONFIG.storybookUrl = `http://localhost:${port}`;
    console.log('🚀 Storybook Metadata Extractor');
    console.log('=================================\n');
  } else if (process.env.STORYBOOK_PORT) {
    CONFIG.storybookUrl = `http://localhost:${process.env.STORYBOOK_PORT}`;
    console.log('🚀 Storybook Metadata Extractor');
    console.log('=================================\n');
  } else if (mode === '--dev') {
    // Auto-detect port for dev mode
    console.log('🚀 Storybook Metadata Extractor');
    console.log('=================================\n');
    
    const detectedPort = await detectStorybookPort();
    if (detectedPort) {
      CONFIG.storybookUrl = `http://localhost:${detectedPort}`;
      console.log(`🎯 Detected Storybook running on port: ${detectedPort}\n`);
    } else {
      console.log('⚠️  Could not detect running Storybook');
      console.log('   Using default port 6006 for messaging\n');
      console.log('💡 Specify port with: --port=XXXX or STORYBOOK_PORT=XXXX\n');
    }
  } else {
    console.log('🚀 Storybook Metadata Extractor');
    console.log('=================================\n');
  }
  
  let metadata;
  
  if (mode === '--dev') {
    console.log('🔧 Development Mode');
    console.log('Extracting from running Storybook...\n');
    metadata = await extractFromRunningStorybook();
    
  } else if (mode === '--build') {
    console.log('📦 Build Mode');
    console.log('Extracting from built Storybook...\n');
    metadata = await extractFromBuiltStorybook();
    
    // Optionally enhance with running Storybook
    if (shouldEnhance && metadata) {
      console.log('\n🎯 Enhancement Mode');
      console.log('Attempting to enhance with full metadata...\n');
      const enhanced = await extractFromRunningStorybook();
      if (enhanced && enhanced.extractedFrom === 'running-storybook') {
        metadata = enhanced;
        console.log('✅ Enhanced with complete metadata');
      }
    }
    
  } else {
    console.error('❌ Invalid mode:', mode);
    console.error('💡 Valid modes: --dev, --build');
    console.error('💡 Usage: node extract-metadata.js --build [--enhance] [--port=6007]');
    console.error('💡 Or set STORYBOOK_URL or STORYBOOK_PORT environment variable');
    process.exit(1);
  }
  
  // Check if extraction was successful
  if (!metadata) {
    console.error('\n❌ Failed to extract metadata');
    process.exit(1);
  }
  
  // Save metadata
  const outputPath = path.join(CONFIG.outputDir, CONFIG.outputFile);
  saveMetadata(metadata, outputPath);
  
  console.log('\n✨ Extraction complete!');
  
  // Extract port from CONFIG.storybookUrl for display
  const urlMatch = CONFIG.storybookUrl.match(/:(\d+)/);
  const currentPort = urlMatch ? urlMatch[1] : '6006';
  
  console.log(`\n📍 Access metadata via Storybook at:`);
  console.log(`   http://localhost:${currentPort}/${CONFIG.outputFile}`);
  console.log(`   http://localhost:${currentPort}/api/stories`);
  console.log(`   http://localhost:${currentPort}/api/components`);
  console.log(`\n📁 Or directly from file:`);
  console.log(`   ${outputPath}\n`);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('\n❌ Fatal error:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
}

// Export for use as a module
export { 
  extractFromBuiltStorybook, 
  extractFromRunningStorybook,
  extractFromSourceFiles,
  extractBasicMetadataFromIndex,
  extractDeepMetadataWithBrowser,
  CONFIG 
};

