#!/usr/bin/env node

/**
 * ==============================================
 * AUTOMATIC SETUP SCRIPT
 * ==============================================
 * 
 * Automatically configures a Storybook project to use
 * the metadata extractor.
 * 
 * Usage: node storybook-api/setup.js
 * 
 * ==============================================
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, message) {
  log(`\n[${step}] ${message}`, 'blue');
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

// ============= SETUP STEPS =============

async function setup() {
  log('\n🚀 Storybook Metadata Extractor Setup', 'bright');
  log('=====================================\n', 'bright');
  
  // Detect if we're running from node_modules (npm install) or from source
  // When installed via npm: __dirname = /path/to/project/node_modules/storybook-api
  // When run from source: __dirname = /path/to/storybook-api
  const isInNodeModules = __dirname.includes('node_modules');
  const projectRoot = isInNodeModules
    ? path.resolve(__dirname, '../..') // From node_modules: go up TWO levels to project root
    : path.resolve(__dirname, '..');    // From source: go up one level
  
  const storybookDir = path.join(projectRoot, '.storybook');
  const packageJsonPath = path.join(projectRoot, 'package.json');
  
  // Step 1: Check if .storybook exists
  logStep(1, 'Checking Storybook configuration...');
  if (!fs.existsSync(storybookDir)) {
    logError('.storybook directory not found!');
    logWarning('Make sure you are running this from a Storybook project root.');
    process.exit(1);
  }
  logSuccess('Found .storybook directory');
  
  // Step 2: Detect module system for .storybook
  logStep(2, 'Detecting Storybook module system...');
  
  // Read package.json (will be needed later too)
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  
  // Check .storybook/main.js syntax (more reliable than project root package.json)
  const mainJsPath = path.join(storybookDir, 'main.js');
  const mainTsPath = path.join(storybookDir, 'main.ts');
  const configPath = fs.existsSync(mainJsPath) ? mainJsPath : mainTsPath;
  
  let isESM = false;
  let detectionMethod = 'default';
  
  if (fs.existsSync(configPath)) {
    const mainConfig = fs.readFileSync(configPath, 'utf-8');
    // Check if main.js uses import statements (ES Module)
    if (/^import\s+/m.test(mainConfig) || /^export\s+(default|const)/m.test(mainConfig)) {
      isESM = true;
      detectionMethod = 'main.js syntax';
    } else if (/require\s*\(/.test(mainConfig) || /module\.exports\s*=/.test(mainConfig)) {
      isESM = false;
      detectionMethod = 'main.js syntax';
    } else {
      // Fallback to package.json check
      isESM = packageJson.type === 'module';
      detectionMethod = 'package.json';
    }
  } else {
    // If no main.js found yet, check package.json
    isESM = packageJson.type === 'module';
    detectionMethod = 'package.json';
  }
  
  const moduleType = isESM ? 'ES Module' : 'CommonJS';
  logSuccess(`Detected ${moduleType} for .storybook/ (via ${detectionMethod})`);
  
  // Step 2.5: Create .storybook/package.json for ES modules
  if (isESM) {
    logStep('2.5', 'Creating .storybook/package.json for ES modules...');
    const storybookPackageJsonPath = path.join(storybookDir, 'package.json');
    
    if (!fs.existsSync(storybookPackageJsonPath)) {
      fs.writeFileSync(
        storybookPackageJsonPath,
        JSON.stringify({ type: 'module' }, null, 2),
        'utf-8'
      );
      logSuccess('Created .storybook/package.json with "type": "module"');
    } else {
      const existingPkg = JSON.parse(fs.readFileSync(storybookPackageJsonPath, 'utf-8'));
      if (existingPkg.type !== 'module') {
        logWarning('.storybook/package.json exists but type is not "module"');
        log('   You may need to add: "type": "module"', 'yellow');
      } else {
        logSuccess('.storybook/package.json already configured correctly');
      }
    }
  }
  
  // Step 3: Copy files to .storybook
  logStep(3, 'Copying files to .storybook...');
  const middlewareFile = isESM ? 'middleware.js' : 'middleware.cjs';
  const filesToCopy = [
    { src: 'extract-metadata.js', dest: '.storybook/extract-metadata.js' },
    { src: middlewareFile, dest: '.storybook/middleware.js' },
  ];
  
  for (const file of filesToCopy) {
    const srcPath = path.join(__dirname, file.src);
    const destPath = path.join(projectRoot, file.dest);
    
    if (fs.existsSync(destPath)) {
      logWarning(`${file.dest} already exists, skipping...`);
    } else {
      fs.copyFileSync(srcPath, destPath);
      logSuccess(`Copied ${file.dest}`);
    }
  }
  
  // Step 4: Update .storybook/main.js
  logStep(4, 'Updating .storybook/main.js...');
  
  if (!fs.existsSync(configPath)) {
    logError('main.js or main.ts not found in .storybook/');
    process.exit(1);
  }
  
  let mainConfig = fs.readFileSync(configPath, 'utf-8');
  
  // Check if middleware is already imported
  if (mainConfig.includes('middleware.js') || mainConfig.includes('./middleware')) {
    logWarning('Middleware already configured in main.js');
  } else {
    // Add import/require at the top based on module system
    let importStatement;
    if (isESM) {
      importStatement = "import middleware from './middleware.js';\n";
    } else {
      importStatement = "const middleware = require('./middleware.js');\n";
    }
    
    if (!mainConfig.includes('middleware')) {
      mainConfig = importStatement + mainConfig;
    }
    
    // Add previewMiddleware to config
    if (!mainConfig.includes('previewMiddleware')) {
      log('   Adding previewMiddleware to config...');
      
      // Strategy: Add BEFORE webpackFinal to avoid placing inside webpack config
      const webpackFinalIndex = mainConfig.indexOf('webpackFinal:');
      const webpackFinalAsyncIndex = mainConfig.indexOf('webpackFinal: async');
      const insertBeforeWebpack = webpackFinalIndex > -1 || webpackFinalAsyncIndex > -1;
      
      if (insertBeforeWebpack) {
        // Find the line before webpackFinal
        const index = webpackFinalIndex > -1 ? webpackFinalIndex : webpackFinalAsyncIndex;
        const lineStart = mainConfig.lastIndexOf('\n', index) + 1;
        
        // Get indentation from webpackFinal line
        const webpackLine = mainConfig.substring(lineStart, index);
        const indent = webpackLine.match(/^(\s*)/)[1];
        
        // Insert before webpackFinal with same indentation
        mainConfig = 
          mainConfig.slice(0, lineStart) +
          `${indent}previewMiddleware: middleware,\n` +
          mainConfig.slice(lineStart);
        
        logSuccess('Added previewMiddleware (before webpackFinal)');
      } else {
        // Fallback: Add at end of config object
        const configRegex = /(const config = \{[\s\S]*?)(\n\};)/;
        const exportRegex = /(export default \{[\s\S]*?)(\n\};)/;
        const moduleExportRegex = /(module\.exports = \{[\s\S]*?)(\n\};)/;
        
        if (configRegex.test(mainConfig)) {
          mainConfig = mainConfig.replace(
            configRegex,
            '$1\n  previewMiddleware: middleware,$2'
          );
          logSuccess('Added previewMiddleware to config');
        } else if (exportRegex.test(mainConfig)) {
          mainConfig = mainConfig.replace(
            exportRegex,
            '$1\n  previewMiddleware: middleware,$2'
          );
          logSuccess('Added previewMiddleware to config');
        } else if (moduleExportRegex.test(mainConfig)) {
          mainConfig = mainConfig.replace(
            moduleExportRegex,
            '$1\n  previewMiddleware: middleware,$2'
          );
          logSuccess('Added previewMiddleware to config');
        } else {
          logWarning('Could not automatically add previewMiddleware');
          logWarning('Please add this manually at the ROOT level of your config (not inside webpackFinal):');
          log('  previewMiddleware: middleware,', 'yellow');
        }
      }
    }
    
    fs.writeFileSync(configPath, mainConfig, 'utf-8');
    logSuccess('Updated main.js with middleware');
  }
  
  // Step 5: Update package.json scripts
  logStep(5, 'Updating package.json scripts...');
  const scriptsToAdd = {
    'metadata:generate': 'node .storybook/extract-metadata.js --build',
    'metadata:dev': 'node .storybook/extract-metadata.js --dev',
    'metadata:full': 'node .storybook/extract-metadata.js --build --enhance',
  };
  
  let scriptsAdded = 0;
  for (const [name, command] of Object.entries(scriptsToAdd)) {
    if (packageJson.scripts[name]) {
      logWarning(`Script "${name}" already exists, skipping...`);
    } else {
      packageJson.scripts[name] = command;
      scriptsAdded++;
      logSuccess(`Added script: ${name}`);
    }
  }
  
  // Update build-storybook script if needed
  if (packageJson.scripts['build-storybook'] && 
      !packageJson.scripts['build-storybook'].includes('metadata:generate')) {
    const originalBuild = packageJson.scripts['build-storybook'];
    packageJson.scripts['build-storybook'] = `${originalBuild} && npm run metadata:generate`;
    logSuccess('Updated build-storybook script to auto-generate metadata');
  }
  
  if (scriptsAdded > 0) {
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2), 'utf-8');
    logSuccess('Updated package.json');
  }
  
  // Step 6: Check for dependencies
  logStep(6, 'Checking dependencies...');
  
  const hasBabelParser = packageJson.devDependencies?.['@babel/parser'] ||
                        packageJson.dependencies?.['@babel/parser'] ||
                        packageJson.devDependencies?.['@babel/core'] ||
                        packageJson.dependencies?.['@babel/core'];
  
  if (hasBabelParser) {
    logSuccess('Babel parser available (source file parsing enabled ⚡)');
  } else {
    logWarning('Babel parser not found (will use fallback methods)');
    log('   Install with: npm install --save-dev @babel/parser @babel/traverse @babel/types glob', 'yellow');
  }
  
  // Step 7: Validate configuration
  logStep(7, 'Validating configuration...');
  const finalMainConfig = fs.readFileSync(configPath, 'utf-8');
  let validationErrors = [];
  let validationWarnings = [];
  
  // Check if previewMiddleware is accidentally inside webpackFinal
  if (finalMainConfig.includes('webpackFinal:')) {
    const webpackStart = finalMainConfig.indexOf('webpackFinal:');
    const webpackEnd = finalMainConfig.indexOf('};', webpackStart);
    
    if (webpackEnd > webpackStart) {
      const webpackSection = finalMainConfig.substring(webpackStart, webpackEnd);
      
      if (webpackSection.includes('previewMiddleware')) {
        validationErrors.push('previewMiddleware found inside webpackFinal (must be at config root level)');
      }
    }
  }
  
  // Check if ES module but no .storybook/package.json
  if (isESM && !fs.existsSync(path.join(storybookDir, 'package.json'))) {
    validationErrors.push('ES module detected but .storybook/package.json is missing');
    validationWarnings.push('Create .storybook/package.json with {"type": "module"}');
  }
  
  // Report validation results
  if (validationErrors.length > 0) {
    logError('Configuration validation failed:');
    validationErrors.forEach(err => log(`   ❌ ${err}`, 'red'));
    
    if (validationWarnings.length > 0) {
      log('\n   Suggested fixes:', 'yellow');
      validationWarnings.forEach(warn => log(`   💡 ${warn}`, 'yellow'));
    }
    
    log('\n   Please fix these issues manually or the setup may not work correctly.\n', 'yellow');
  } else {
    logSuccess('Configuration validation passed ✅');
  }
  
  // Summary
  log('\n' + '='.repeat(50), 'bright');
  log('✨ Setup Complete!', 'green');
  log('='.repeat(50) + '\n', 'bright');
  
  log('📖 Next Steps:', 'bright');
  log('\n1. Start Storybook:');
  log('   npm run storybook\n', 'blue');
  
  log('2. Extract metadata (in another terminal):');
  log('   npm run metadata:dev\n', 'blue');
  
  log('3. Access metadata at:');
  log('   http://localhost:6006/stories.json\n', 'blue');
  
  log('📚 For production builds:');
  log('   npm run build-storybook\n', 'blue');
  log('   (Metadata will be auto-generated at storybook-static/stories.json)\n');
  
  if (!hasBabelParser) {
    log('💡 Tip: For fastest extraction with complete metadata, install:', 'yellow');
    log('   npm install --save-dev @babel/parser @babel/traverse @babel/types glob\n', 'yellow');
  }
  
  log('📖 Read more: storybook-api/README.md\n');
}

// Run setup
setup().catch(err => {
  logError('Setup failed: ' + err.message);
  console.error(err);
  process.exit(1);
});

