/**
 * ==============================================
 * GENERIC STORYBOOK METADATA MIDDLEWARE (CommonJS)
 * ==============================================
 * 
 * Express middleware to serve stories.json during
 * Storybook development.
 * 
 * Add to .storybook/main.js (CommonJS projects):
 *   const middleware = require('./middleware.cjs');
 *   
 *   module.exports = {
 *     // ... config ...
 *     previewMiddleware: middleware,
 *   };
 * 
 * ==============================================
 */

const fs = require('fs');
const path = require('path');

// In CommonJS, __dirname is available directly
// If running in a context where it's not available, use process.cwd() as fallback
const __dirname = typeof __dirname !== 'undefined' 
  ? __dirname 
  : path.join(process.cwd(), '.storybook');

// Configuration from environment variables
const CONFIG = {
  corsOrigin: process.env.STORYBOOK_CORS_ORIGIN || '*',
  cacheTTL: parseInt(process.env.STORYBOOK_CACHE_TTL || '5000', 10),
};

// In-memory cache for metadata
let metadataCache = {
  data: null,
  timestamp: 0,
  filePath: null,
};

/**
 * Validate file path to prevent directory traversal attacks
 */
function validatePath(filepath, baseDir) {
  try {
    const resolved = path.resolve(filepath);
    const base = path.resolve(baseDir);
    return resolved.startsWith(base);
  } catch {
    return false;
  }
}

/**
 * Middleware to serve stories.json endpoint
 */
function middleware(router) {
  
  // GET /stories.json - Main endpoint
  router.get('/stories.json', (req, res) => {
    try {
      const now = Date.now();
      
      // Check cache first
      if (metadataCache.data && 
          metadataCache.timestamp && 
          (now - metadataCache.timestamp) < CONFIG.cacheTTL &&
          metadataCache.filePath &&
          fs.existsSync(metadataCache.filePath)) {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', CONFIG.corsOrigin);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.end(JSON.stringify(metadataCache.data, null, 2));
        return;
      }
      
      const possiblePaths = [
        // Built storybook
        path.join(__dirname, '../storybook-static/stories.json'),
        // Temp file from extractor
        path.join(__dirname, '../.storybook-metadata-temp.json'),
        // Alternative location
        path.join(__dirname, 'stories.json'),
      ];
      
      // Find first existing file
      let metadataPath = null;
      for (const filepath of possiblePaths) {
        // Validate path to prevent directory traversal
        if (!validatePath(filepath, process.cwd())) {
          continue;
        }
        
        if (fs.existsSync(filepath)) {
          metadataPath = filepath;
          break;
        }
      }
      
      if (metadataPath) {
        try {
          const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
          
          // Update cache
          metadataCache = {
            data: metadata,
            timestamp: now,
            filePath: metadataPath,
          };
          
          // Set appropriate headers
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', CONFIG.corsOrigin);
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('X-Content-Type-Options', 'nosniff');
          
          // Send metadata
          res.end(JSON.stringify(metadata, null, 2));
          
        } catch (err) {
          console.error('Error reading metadata file:', err);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.end(JSON.stringify({ 
            error: 'Failed to read metadata', 
            message: err.message,
            timestamp: new Date().toISOString(),
          }, null, 2));
        }
      } else {
        // No metadata file found
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.end(JSON.stringify({
          error: 'Metadata not found',
          message: 'Stories metadata has not been generated yet',
          timestamp: new Date().toISOString(),
          instructions: [
            'For development: Run `npm run metadata:dev` in a separate terminal',
            'For build: Run `npm run build-storybook`',
            'Make sure Storybook is running before extracting metadata',
          ],
        }, null, 2));
      }
    } catch (error) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.end(JSON.stringify({
        error: 'Internal server error',
        message: error.message,
        timestamp: new Date().toISOString(),
      }, null, 2));
    }
  });
  
  // GET /stories.json/refresh - Force refresh endpoint
  router.get('/stories.json/refresh', (req, res) => {
    try {
      // Clear cache
      metadataCache = { data: null, timestamp: 0, filePath: null };
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.end(JSON.stringify({
        message: 'To refresh metadata, run the extraction script again',
        commands: {
          development: 'npm run metadata:dev',
          build: 'npm run build-storybook',
        },
        cacheCleared: true,
      }, null, 2));
    } catch (error) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        error: 'Failed to process refresh request',
        message: error.message,
        timestamp: new Date().toISOString(),
      }, null, 2));
    }
  });
  
  // GET /stories.json/stats - Statistics endpoint
  router.get('/stories.json/stats', (req, res) => {
    try {
      const metadata = metadataCache.data || (() => {
        const metadataPath = path.join(__dirname, '../storybook-static/stories.json');
        if (fs.existsSync(metadataPath) && validatePath(metadataPath, process.cwd())) {
          try {
            return JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
          } catch {
            return null;
          }
        }
        return null;
      })();
      
      if (metadata) {
        const stats = {
          totalStories: metadata.totalStories || 0,
          generatedAt: metadata.generatedAt,
          extractedFrom: metadata.extractedFrom,
          storybookVersion: metadata.storybookVersion,
          storyTitles: Object.keys(
            Object.values(metadata.stories || {}).reduce((acc, story) => {
              acc[story.title] = true;
              return acc;
            }, {})
          ),
        };
        
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.end(JSON.stringify(stats, null, 2));
      } else {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.end(JSON.stringify({ 
          error: 'Metadata not found',
          timestamp: new Date().toISOString(),
        }, null, 2));
      }
    } catch (error) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.end(JSON.stringify({ 
        error: 'Failed to read stats', 
        message: error.message,
        timestamp: new Date().toISOString(),
      }, null, 2));
    }
  });
  
  return router;
}

// Export for CommonJS
module.exports = middleware;

