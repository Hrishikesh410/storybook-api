/**
 * ==============================================
 * STORYBOOK REST API MIDDLEWARE
 * ==============================================
 * 
 * REST API for serving Storybook component metadata.
 * Works with any Storybook project (React, Vue, Angular, etc.)
 * 
 * Endpoints:
 *   - GET /api/stories              - All stories with optional filters
 *   - GET /api/components           - List all components
 *   - GET /api/components/:id       - Get specific component data
 *   - GET /api/components/:id/docs  - Get component documentation
 *   - GET /api/components/:id/examples - Get code examples
 *   - GET /api/search?q=query       - Search stories/components
 *   - GET /api/health               - Health check
 * 
 * Legacy endpoints (backward compatible):
 *   - GET /stories.json             - Original metadata endpoint
 *   - GET /stories.json/stats       - Statistics endpoint
 * 
 * Tested with Storybook 7.x and 8.x
 * ==============================================
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Constants
const JSON_INDENT = 2; // Pretty print JSON responses

// Configuration from environment variables
const CONFIG = {
  // CORS: Allow specific origins or use wildcard for development
  // Set STORYBOOK_CORS_ORIGIN env var to restrict origins (comma-separated)
  corsOrigin: process.env.STORYBOOK_CORS_ORIGIN || '*',
  
  // Cache TTL in milliseconds (default: 5 seconds)
  cacheTTL: parseInt(process.env.STORYBOOK_CACHE_TTL || '5000', 10),
  
  // Maximum query string length to prevent DoS
  maxQueryLength: 2048,
  
  // Maximum search query length
  maxSearchLength: 200,
};

// In-memory cache for metadata
let metadataCache = {
  data: null,
  timestamp: 0,
  filePath: null,
};

/**
 * Middleware function that adds REST API endpoints to Storybook
 * @param {object} router - Express router instance from Storybook
 */
export default function middleware(router) {
  /**
   * Get the directory path for this middleware file.
   * Handles both ES modules and CommonJS contexts.
   */
  const getDirname = () => {
    // Try ES module first
    try {
      if (typeof import.meta !== 'undefined' && import.meta.url) {
        return path.dirname(fileURLToPath(import.meta.url));
      }
    } catch (e) {
      // Not in ES module context, try next approach
    }
    
    // Try CommonJS
    try {
      if (typeof __dirname !== 'undefined') {
        return __dirname;
      }
    } catch (e) {
      // Also failed, use fallback
    }
    
    // Fallback to .storybook directory
    return path.join(process.cwd(), '.storybook');
  };
  
  /**
   * Validate file path to prevent directory traversal attacks
   * @param {string} filepath - Path to validate
   * @param {string} baseDir - Base directory to ensure path stays within
   * @returns {boolean} True if path is safe
   */
  const validatePath = (filepath, baseDir) => {
    try {
      const resolved = path.resolve(filepath);
      const base = path.resolve(baseDir);
      return resolved.startsWith(base);
    } catch {
      return false;
    }
  };

  /**
   * Load metadata from filesystem with caching.
   * Checks multiple locations because different setups put the file in different places.
   * 
   * @returns {object|null} Parsed metadata object or null if not found
   */
  const loadMetadata = () => {
    const now = Date.now();
    const dirname = getDirname();
    
    // Check if cache is still valid
    if (metadataCache.data && 
        metadataCache.timestamp && 
        (now - metadataCache.timestamp) < CONFIG.cacheTTL &&
        metadataCache.filePath &&
        fs.existsSync(metadataCache.filePath)) {
      return metadataCache.data;
    }
    
    // Check common locations where metadata might be stored
    const possiblePaths = [
      path.join(dirname, '../storybook-static/stories.json'),
      path.join(dirname, '../.storybook-metadata-temp.json'), // Temp file during dev
      path.join(dirname, 'stories.json'),
      path.join(process.cwd(), 'storybook-static/stories.json'), // Fallback
    ];
    
    // Return first file that exists and can be parsed
    for (const filepath of possiblePaths) {
      // Validate path to prevent directory traversal
      if (!validatePath(filepath, process.cwd())) {
        console.warn(`Skipping invalid path: ${filepath}`);
        continue;
      }
      
      if (fs.existsSync(filepath)) {
        try {
          const metadata = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
          
          // Update cache
          metadataCache = {
            data: metadata,
            timestamp: now,
            filePath: filepath,
          };
          
          return metadata;
        } catch (err) {
          // Corrupted JSON? Log it and continue checking other paths
          console.error('Error parsing metadata:', err.message);
          continue;
        }
      }
    }
    
    // Clear cache if no file found
    metadataCache = { data: null, timestamp: 0, filePath: null };
    return null; // No metadata found
  };
  
  /**
   * Get CORS origin header value based on configuration
   * @param {object} req - Request object (optional, for origin checking)
   * @returns {string} CORS origin value
   */
  const getCorsOrigin = (req) => {
    if (CONFIG.corsOrigin === '*') {
      return '*';
    }
    
    // If specific origins are configured, check request origin
    const origins = CONFIG.corsOrigin.split(',').map(o => o.trim());
    const requestOrigin = req?.headers?.origin;
    
    if (requestOrigin && origins.includes(requestOrigin)) {
      return requestOrigin;
    }
    
    // Default to first configured origin or wildcard
    return origins[0] || '*';
  };

  /**
   * Send a JSON response with proper headers.
   * Using vanilla Node.js API for Storybook 8.x compatibility.
   */
  const sendJSON = (res, data, statusCode = 200, req = null) => {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', getCorsOrigin(req));
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(JSON.stringify(data, null, JSON_INDENT));
  };
  
  /**
   * Send an error response with helpful details
   */
  const sendError = (res, message, statusCode = 500, details = {}, req = null) => {
    const errorResponse = {
      error: message,
      statusCode,
      timestamp: new Date().toISOString(),
      ...details
    };
    
    // Log errors for monitoring (in production, use proper logging library)
    if (statusCode >= 500) {
      console.error(`[${statusCode}] ${message}`, details);
    } else if (statusCode >= 400) {
      console.warn(`[${statusCode}] ${message}`, details);
    }
    
    sendJSON(res, errorResponse, statusCode, req);
  };

  /**
   * Validate and sanitize input strings
   * @param {string} input - Input to validate
   * @param {number} maxLength - Maximum allowed length
   * @returns {string|null} Sanitized string or null if invalid
   */
  const validateInput = (input, maxLength = 200) => {
    if (typeof input !== 'string') return null;
    if (input.length > maxLength) return null;
    if (input.length === 0) return null;
    
    // Remove potentially dangerous characters but allow normal query strings
    // Allow alphanumeric, spaces, hyphens, underscores, and common URL-safe chars
    const sanitized = input.trim();
    if (sanitized.length === 0) return null;
    
    return sanitized;
  };
  
  /**
   * Parse query parameters from URL with validation.
   * Simple parser - good enough for our use case.
   */
  const parseQuery = (url) => {
    // Validate URL length to prevent DoS
    if (url.length > CONFIG.maxQueryLength) {
      throw new Error('Query string too long');
    }
    
    const queryString = url.split('?')[1];
    if (!queryString) return {};
    
    const params = {};
    try {
      queryString.split('&').forEach(param => {
        const [key, value] = param.split('=');
        const decodedKey = decodeURIComponent(key || '');
        const decodedValue = decodeURIComponent(value || '');
        
        // Validate key and value
        if (decodedKey && validateInput(decodedKey, 100)) {
          params[decodedKey] = validateInput(decodedValue, CONFIG.maxSearchLength) || '';
        }
      });
    } catch (err) {
      // Invalid encoding, return empty params
      console.warn('Error parsing query string:', err.message);
      return {};
    }
    
    return params;
  };
  
  /**
   * Convert a component title/kind to a URL-safe ID.
   * E.g., "Components/Button" becomes "components-button"
   */
  const getComponentId = (titleOrKind) => {
    // Convert to lowercase kebab-case and trim leading/trailing hyphens
    return (titleOrKind || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  };
  
  /**
   * Find stories by component ID.
   * Extracted to reduce duplication across endpoints.
   */
  const findStoriesByComponentId = (metadata, componentId) => {
    return Object.values(metadata.stories || {}).filter(story => {
      const storyComponentId = getComponentId(story.title || story.kind);
      return storyComponentId === componentId;
    });
  };
  
  /**
   * Extract component ID from URL path with validation.
   * Used by component detail endpoints.
   */
  const extractComponentIdFromUrl = (url) => {
    const match = url.match(/^\/api\/components\/([^\/\?]+)/);
    if (!match) return '';
    
    try {
      const decoded = decodeURIComponent(match[1]);
      // Validate component ID (alphanumeric, hyphens, underscores only)
      if (/^[a-z0-9-_]+$/i.test(decoded) && decoded.length <= 200) {
        return decoded;
      }
    } catch (err) {
      console.warn('Error decoding component ID:', err.message);
    }
    
    return '';
  };
  
  /**
   * Generate a usage example (JSX-like) from story args.
   * This gives developers a quick copy-paste starting point.
   */
  const generateUsageExample = (story) => {
    const componentName = story.component || story.title?.split('/').pop() || 'Component';
    
    // No args? Just render the basic component
    if (!story.args || Object.keys(story.args).length === 0) {
      return `<${componentName} />`;
    }
    
    // Convert args to JSX props format
    const props = Object.entries(story.args)
      .map(([key, value]) => {
        if (typeof value === 'string') {
          return `${key}="${value}"`;
        } else if (typeof value === 'boolean') {
          return value ? key : ''; // Boolean true props can be shorthand
        } else if (typeof value === 'number') {
          return `${key}={${value}}`;
        } else {
          // Objects, arrays, etc. - JSON stringify them
          return `${key}={${JSON.stringify(value)}}`;
        }
      })
      .filter(Boolean)
      .join(' ');
    
    return `<${componentName} ${props} />`;
  };
  
  // ============================================
  // API ENDPOINTS
  // ============================================
  
  /**
   * GET /api/health
   * Simple health check to verify API is running and metadata is available
   */
  router.get('/api/health', (req, res) => {
    try {
      const metadata = loadMetadata();
      
      sendJSON(res, {
        status: metadata ? 'healthy' : 'no-metadata',
        timestamp: new Date().toISOString(),
        message: metadata 
          ? 'Storybook metadata API is running'
          : 'Metadata not generated yet. Run metadata extraction.',
        metadata: metadata ? {
          totalStories: metadata.totalStories || 0,
          generatedAt: metadata.generatedAt,
          storybookVersion: metadata.storybookVersion,
          extractedFrom: metadata.extractedFrom
        } : null,
        instructions: metadata ? null : [
          'Development: npm run metadata:dev',
          'Production: npm run build-storybook'
        ],
        cache: {
          enabled: CONFIG.cacheTTL > 0,
          ttl: CONFIG.cacheTTL
        }
      }, 200, req);
    } catch (error) {
      sendError(res, 'Health check failed', 500, { 
        error: error.message 
      }, req);
    }
  });
  
  /**
   * GET /api/stories
   * Get all stories with optional filtering via query params
   * Supports: ?title=X&tag=Y&kind=Z
   */
  router.get('/api/stories', (req, res) => {
    try {
      const metadata = loadMetadata();
      
      // Early return if no metadata - prefer this style for clarity
      if (!metadata) {
        return sendError(res, 'Metadata not found', 404, {
          instructions: [
            'Run `npm run metadata:dev` in development',
            'Run `npm run build-storybook` for production'
          ]
        }, req);
      }
      
      // Parse and apply filters with validation
      let query;
      try {
        query = parseQuery(req.url);
      } catch (err) {
        return sendError(res, 'Invalid query string', 400, {
          error: err.message
        }, req);
      }
      
      const { title, tag, kind } = query;
      let stories = Object.values(metadata.stories || {});
      
      // Filter by title (partial match, case-insensitive) - validated input
      if (title) {
        const validatedTitle = validateInput(title, CONFIG.maxSearchLength);
        if (validatedTitle) {
          stories = stories.filter(s => 
            s.title?.toLowerCase().includes(validatedTitle.toLowerCase())
          );
        }
      }
      
      // Filter by tag (exact match) - validated input
      if (tag) {
        const validatedTag = validateInput(tag, 100);
        if (validatedTag) {
          stories = stories.filter(s => 
            Array.isArray(s.tags) && s.tags.includes(validatedTag)
          );
        }
      }
      
      // Filter by kind (partial match, case-insensitive) - validated input
      if (kind) {
        const validatedKind = validateInput(kind, CONFIG.maxSearchLength);
        if (validatedKind) {
          stories = stories.filter(s => 
            s.kind?.toLowerCase().includes(validatedKind.toLowerCase())
          );
        }
      }
      
      sendJSON(res, {
        total: stories.length,
        filtered: Boolean(title || tag || kind),
        stories,
        metadata: {
          generatedAt: metadata.generatedAt,
          storybookVersion: metadata.storybookVersion,
          extractedFrom: metadata.extractedFrom
        }
      }, 200, req);
    } catch (error) {
      sendError(res, 'Failed to fetch stories', 500, {
        error: error.message
      }, req);
    }
  });
  
  /**
   * GET /api/components
   * List all unique components (grouped stories by component name)
   */
  router.get('/api/components', (req, res) => {
    try {
      const metadata = loadMetadata();
      
      if (!metadata) {
        return sendError(res, 'Metadata not found', 404, {
          instructions: [
            'Run `npm run metadata:dev` to generate metadata'
          ]
        }, req);
      }
    
    // Group stories by component
    // Using a map to collect all stories for each component
    const componentMap = {};
    
    Object.values(metadata.stories || {}).forEach(story => {
      const componentName = story.title || story.kind;
      const componentId = getComponentId(componentName);
      
      // Initialize component entry if first time seeing it
      if (!componentMap[componentId]) {
        componentMap[componentId] = {
          id: componentId,
          name: componentName,
          title: story.title,
          kind: story.kind,
          stories: [],
          tags: new Set(story.tags || []), // Using Set to auto-dedupe tags
          importPath: story.importPath
        };
      }
      
      // Add story to component
      componentMap[componentId].stories.push({
        id: story.id,
        name: story.name,
        story: story.story
      });
      
      // Merge tags from this story
      (story.tags || []).forEach(tag => 
        componentMap[componentId].tags.add(tag)
      );
    });
    
    // Convert map to array and format for response
    const components = Object.values(componentMap).map(comp => ({
      ...comp,
      tags: Array.from(comp.tags), // Convert Set back to array
      storyCount: comp.stories.length
    }));
    
      sendJSON(res, {
        total: components.length,
        components
      }, 200, req);
    } catch (error) {
      sendError(res, 'Failed to fetch components', 500, {
        error: error.message
      }, req);
    }
  });
  
  /**
   * GET /api/components/:id
   * Get detailed information about a specific component
   */
  router.get(/^\/api\/components\/([^\/]+)$/, (req, res) => {
    try {
      const metadata = loadMetadata();
      
      if (!metadata) {
        return sendError(res, 'Metadata not found', 404, {}, req);
      }
      
      // Extract component ID from URL path
      const componentId = extractComponentIdFromUrl(req.url);
      
      if (!componentId) {
        return sendError(res, 'Invalid component ID', 400, {
          suggestion: 'Component ID must be alphanumeric with hyphens/underscores only'
        }, req);
      }
    
    // Find all stories for this component
    const stories = findStoriesByComponentId(metadata, componentId);
    
    if (stories.length === 0) {
      return sendError(res, 'Component not found', 404, {
        componentId,
        suggestion: 'Use GET /api/components to see available components'
      });
    }
    
    // Aggregate data from all stories of this component
    const firstStory = stories[0];
    const allTags = new Set();
    const allArgs = {};
    const allArgTypes = {};
    
    // Merge args and argTypes from all stories
    // This gives a complete picture of all possible props
    stories.forEach(story => {
      (story.tags || []).forEach(tag => allTags.add(tag));
      Object.assign(allArgs, story.args);
      Object.assign(allArgTypes, story.argTypes);
    });
    
    const componentData = {
      id: componentId,
      name: firstStory.title || firstStory.kind,
      title: firstStory.title,
      kind: firstStory.kind,
      importPath: firstStory.importPath,
      tags: Array.from(allTags),
      stories: stories.map(s => ({
        id: s.id,
        name: s.name,
        story: s.story,
        args: s.args,
        initialArgs: s.initialArgs,
        argTypes: s.argTypes,
        parameters: s.parameters
      })),
      args: allArgs,
      argTypes: allArgTypes,
      component: firstStory.component,
      storyCount: stories.length
    };
    
      sendJSON(res, componentData, 200, req);
    } catch (error) {
      sendError(res, 'Failed to fetch component', 500, {
        error: error.message
      }, req);
    }
  });
  
  /**
   * GET /api/components/:id/docs
   * Get documentation for a specific component
   */
  router.get(/^\/api\/components\/([^\/]+)\/docs$/, (req, res) => {
    try {
      const metadata = loadMetadata();
      
      if (!metadata) {
        return sendError(res, 'Metadata not found', 404, {}, req);
      }
      
      // Extract component ID from URL path
      const componentId = extractComponentIdFromUrl(req.url);
      
      if (!componentId) {
        return sendError(res, 'Invalid component ID', 400, {}, req);
      }
      
      // Find stories for this component
      const stories = findStoriesByComponentId(metadata, componentId);
      
      if (stories.length === 0) {
        return sendError(res, 'Component not found', 404, {
          componentId
        }, req);
      }
    
    // Extract documentation from stories
    const firstStory = stories[0];
    const docs = {
      component: firstStory.title || firstStory.kind,
      description: firstStory.docs?.description || '',
      mdx: firstStory.docs?.mdx || '',
      sourceCode: firstStory.docs?.sourceCode || firstStory.source || '',
      argTypes: firstStory.argTypes || {},
      stories: stories.map(s => ({
        name: s.name,
        description: s.docs?.description || '',
        args: s.args,
        argTypes: s.argTypes,
        source: s.source
      })),
      parameters: firstStory.parameters || {},
      tags: firstStory.tags || [],
      importPath: firstStory.importPath
    };
    
      sendJSON(res, docs, 200, req);
    } catch (error) {
      sendError(res, 'Failed to fetch component docs', 500, {
        error: error.message
      }, req);
    }
  });
  
  /**
   * GET /api/components/:id/examples
   * Get code examples and usage patterns for a component
   */
  router.get(/^\/api\/components\/([^\/]+)\/examples$/, (req, res) => {
    try {
      const metadata = loadMetadata();
      
      if (!metadata) {
        return sendError(res, 'Metadata not found', 404, {}, req);
      }
      
      // Extract component ID from URL path
      const componentId = extractComponentIdFromUrl(req.url);
      
      if (!componentId) {
        return sendError(res, 'Invalid component ID', 400, {}, req);
      }
      
      // Find stories for this component
      const stories = findStoriesByComponentId(metadata, componentId);
      
      if (stories.length === 0) {
        return sendError(res, 'Component not found', 404, {
          componentId
        }, req);
      }
    
    const firstStory = stories[0];
    
    // Build code examples
    const examples = {
      component: firstStory.title || firstStory.kind,
      importPath: firstStory.importPath,
      sourceFile: firstStory.parameters?.fileName || '',
      examples: stories.map(story => ({
        name: story.name,
        description: `${story.story} example`,
        code: story.source || story.docs?.sourceCode || '',
        args: story.args || {},
        argTypes: story.argTypes || {},
        usage: generateUsageExample(story)
      }))
    };
    
      sendJSON(res, examples, 200, req);
    } catch (error) {
      sendError(res, 'Failed to fetch component examples', 500, {
        error: error.message
      }, req);
    }
  });
  
  /**
   * GET /api/search
   * Search across all stories by title, name, kind, tags, etc.
   * Query param: ?q=searchterm
   */
  router.get('/api/search', (req, res) => {
    try {
      const metadata = loadMetadata();
      
      if (!metadata) {
        return sendError(res, 'Metadata not found', 404, {}, req);
      }
      
      let query;
      try {
        query = parseQuery(req.url);
      } catch (err) {
        return sendError(res, 'Invalid query string', 400, {
          error: err.message
        }, req);
      }
      
      const rawQuery = query.q || '';
      const searchQuery = validateInput(rawQuery, CONFIG.maxSearchLength);
      
      if (!searchQuery) {
        return sendError(res, 'Missing or invalid search query', 400, {
          usage: 'GET /api/search?q=button',
          example: 'http://localhost:6006/api/search?q=button',
          maxLength: CONFIG.maxSearchLength
        }, req);
      }
      
      const searchLower = searchQuery.toLowerCase();
      
      // Search across multiple fields - pretty comprehensive
      const results = Object.values(metadata.stories || {}).filter(story => {
        return (
          story.title?.toLowerCase().includes(searchLower) ||
          story.name?.toLowerCase().includes(searchLower) ||
          story.kind?.toLowerCase().includes(searchLower) ||
          story.story?.toLowerCase().includes(searchLower) ||
          (Array.isArray(story.tags) && story.tags.some(tag => 
            tag.toLowerCase().includes(searchLower)
          )) ||
          story.id?.toLowerCase().includes(searchLower)
        );
      });
      
      sendJSON(res, {
        query: searchQuery,
        total: results.length,
        results
      }, 200, req);
    } catch (error) {
      sendError(res, 'Search failed', 500, {
        error: error.message
      }, req);
    }
  });
  
  // ============================================
  // LEGACY ENDPOINTS
  // ============================================
  // Kept for backward compatibility with v1.3.0
  
  /**
   * GET /stories.json
   * Legacy endpoint - returns full metadata dump
   * Kept for backward compatibility
   */
  router.get('/stories.json', (req, res) => {
    try {
      const metadata = loadMetadata();
      
      if (metadata) {
        sendJSON(res, metadata, 200, req);
      } else {
        sendError(res, 'Metadata not found', 404, {
          instructions: [
            'For development: Run `npm run metadata:dev` in a separate terminal',
            'For build: Run `npm run build-storybook`',
            'Make sure Storybook is running before extracting metadata',
          ]
        }, req);
      }
    } catch (error) {
      sendError(res, 'Failed to fetch metadata', 500, {
        error: error.message
      }, req);
    }
  });
  
  /**
   * GET /stories.json/stats
   * Legacy statistics endpoint
   */
  router.get('/stories.json/stats', (req, res) => {
    try {
      const metadata = loadMetadata();
      
      if (!metadata) {
        return sendError(res, 'Metadata not found', 404, {}, req);
      }
    
    // Aggregate stats from metadata
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
    
      sendJSON(res, stats, 200, req);
    } catch (error) {
      sendError(res, 'Failed to fetch stats', 500, {
        error: error.message
      }, req);
    }
  });
  
  /**
   * GET /stories.json/refresh
   * Legacy refresh endpoint - just returns instructions
   * (Actual refresh happens by re-running the extraction script)
   */
  router.get('/stories.json/refresh', (req, res) => {
    try {
      // Clear cache when refresh is requested
      metadataCache = { data: null, timestamp: 0, filePath: null };
      
      sendJSON(res, {
        message: 'To refresh metadata, run the extraction script again',
        commands: {
          development: 'npm run metadata:dev',
          build: 'npm run build-storybook',
        },
        cacheCleared: true,
      }, 200, req);
    } catch (error) {
      sendError(res, 'Failed to process refresh request', 500, {
        error: error.message
      }, req);
    }
  });
  
  return router;
}

// CommonJS compatibility export
export { middleware };
