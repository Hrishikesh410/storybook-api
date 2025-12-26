# 📚 Storybook API

> Extract and expose your Storybook component metadata via REST API

A **generic, framework-agnostic** solution to extract complete metadata from any Storybook project and expose it through a comprehensive REST API.

## ✨ Features

- 🎯 **100% Generic** - Works with any Storybook v7+ and v8+ (React, Vue, Angular, Svelte, etc.)
- ⚡ **Lightning Fast** - Extracts 400+ stories in ~5 seconds using source file parsing
- 🌐 **REST API** - 7 endpoints automatically available when Storybook runs
- 🔍 **Complete Metadata** - Args, argTypes, controls, actions, parameters, source code, docs
- 📚 **OpenAPI/Swagger** - Full API documentation included
- 🚀 **Zero Config** - Auto-detects port, module system, everything
- 📦 **Portable** - Just copy, run setup, and you're done
- 🧪 **Tested** - Automated test suite included

## 📋 Table of Contents

- [Quick Start](#-quick-start)
- [Usage](#-usage)
- [REST API Reference](#-rest-api-reference)
- [API Examples](#-api-examples)
- [Swagger/OpenAPI Documentation](#-swaggeropenapi-documentation)
- [Testing](#-testing)
- [What Gets Extracted](#-what-gets-extracted)
- [Troubleshooting](#-troubleshooting)
- [Configuration](#-configuration)
- [Compatibility](#-compatibility)
- [Changelog](#-changelog)
- [Contributing](#-contributing)

---

## 🚀 Quick Start

### Step 1: Install

```bash
# Install via npm
npm install storybook-api --save-dev

# Or with yarn
yarn add storybook-api --dev

# Or with pnpm
pnpm add storybook-api --save-dev
```

### Step 2: Setup

```bash
# Run setup (automatic)
npx storybook-api-setup

# Or if installed locally
node node_modules/storybook-api/setup.js
```

The setup script automatically:
- ✅ Detects your module system (ESM/CommonJS)
- ✅ Copies required files to `.storybook/`
- ✅ Updates `.storybook/main.js` with middleware
- ✅ Adds npm scripts to `package.json`
- ✅ Creates `.storybook/package.json` if needed (for ESM projects)

### Step 3: Use It

**Terminal 1** - Start Storybook:
```bash
npm run storybook
# ✅ Storybook starts with REST API automatically available!
```

**Terminal 2** - Generate metadata:
```bash
npm run metadata:dev
# ✅ Extracts metadata in ~5 seconds
```

**Test the API:**
```bash
curl http://localhost:6006/api/health
curl http://localhost:6006/api/components
```

That's it! 🎉

---

## 💻 Usage

### Development Mode

```bash
# Terminal 1: Start Storybook
npm run storybook

# Terminal 2: Extract metadata
npm run metadata:dev
```

Storybook API:
- Auto-detects which port Storybook is running on (6006, 6007, 6008, 6009, 9009, etc.)
- Uses source file parsing for complete metadata
- Generates `storybook-static/stories.json` in ~5 seconds
- Shows correct URLs based on detected port

### Production Build

```bash
npm run build-storybook
```

Metadata is automatically generated during build at `storybook-static/stories.json`

### Custom Port

```bash
# Specify port manually
node .storybook/extract-metadata.js --dev --port=6007

# Or use environment variable
STORYBOOK_PORT=6007 npm run metadata:dev
```

---

## 🌐 REST API Reference

Once installed, your Storybook automatically exposes 7 REST API endpoints!

### Base URL

```
http://localhost:6006/api
```

### Endpoints Overview

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check and API status |
| `/api/stories` | GET | All stories with optional filtering |
| `/api/components` | GET | List all unique components |
| `/api/components/:id` | GET | Get specific component details |
| `/api/components/:id/docs` | GET | Get component documentation |
| `/api/components/:id/examples` | GET | Get code examples and usage |
| `/api/search?q=query` | GET | Search stories and components |

### 1. Health Check

```bash
GET /api/health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-12-15T10:00:00.000Z",
  "message": "Storybook metadata API is running",
  "metadata": {
    "totalStories": 405,
    "generatedAt": "2025-12-15T09:59:00.000Z",
    "storybookVersion": "8.0.0",
    "extractedFrom": "source-files"
  }
}
```

### 2. Get All Stories

```bash
GET /api/stories
GET /api/stories?title=button
GET /api/stories?tag=autodocs
GET /api/stories?kind=components
```

**Query Parameters:**
- `title` - Filter by title (partial match, case-insensitive)
- `tag` - Filter by tag (exact match)
- `kind` - Filter by kind (partial match)

**Response:**
```json
{
  "total": 10,
  "filtered": true,
  "stories": [
    {
      "id": "components-button--default",
      "title": "Components/Button",
      "name": "Default",
      "args": { "variant": "primary", "size": "medium" },
      "argTypes": { "variant": { "control": { "type": "select" } } },
      "tags": ["autodocs"],
      "importPath": "./src/Button.stories.tsx"
    }
  ],
  "metadata": {
    "generatedAt": "2025-12-15T09:59:00.000Z",
    "storybookVersion": "8.0.0"
  }
}
```

### 3. List All Components

```bash
GET /api/components
```

**Response:**
```json
{
  "total": 5,
  "components": [
    {
      "id": "components-button",
      "name": "Components/Button",
      "title": "Components/Button",
      "storyCount": 3,
      "tags": ["autodocs", "test"],
      "importPath": "./src/Button.stories.tsx",
      "stories": [
        { "id": "components-button--default", "name": "Default" },
        { "id": "components-button--primary", "name": "Primary" }
      ]
    }
  ]
}
```

### 4. Get Component by ID

```bash
GET /api/components/:id
```

**Example:**
```bash
curl http://localhost:6006/api/components/components-button
```

**Response:**
```json
{
  "id": "components-button",
  "name": "Components/Button",
  "title": "Components/Button",
  "storyCount": 3,
  "importPath": "./src/Button.stories.tsx",
  "tags": ["autodocs"],
  "args": { "variant": "primary", "size": "medium" },
  "argTypes": {
    "variant": {
      "control": { "type": "select" },
      "options": ["primary", "secondary", "tertiary"]
    }
  },
  "stories": [
    {
      "id": "components-button--default",
      "name": "Default",
      "args": { "variant": "primary" }
    }
  ]
}
```

### 5. Get Component Documentation

```bash
GET /api/components/:id/docs
```

**Response:**
```json
{
  "component": "Components/Button",
  "description": "Button component for user interactions",
  "mdx": "...",
  "sourceCode": "export const Button = ({ variant, ...props }) => ...",
  "argTypes": { ... },
  "stories": [
    {
      "name": "Default",
      "description": "Default button state",
      "args": { "variant": "primary" }
    }
  ]
}
```

### 6. Get Component Examples

```bash
GET /api/components/:id/examples
```

**Response:**
```json
{
  "component": "Components/Button",
  "importPath": "./src/Button.stories.tsx",
  "examples": [
    {
      "name": "Primary",
      "description": "Primary example",
      "code": "export const Primary = Template.bind({});",
      "args": { "variant": "primary" },
      "usage": "<Button variant=\"primary\" size=\"medium\" />"
    }
  ]
}
```

### 7. Search Stories

```bash
GET /api/search?q=button
```

**Response:**
```json
{
  "query": "button",
  "total": 5,
  "results": [
    {
      "id": "components-button--default",
      "title": "Components/Button",
      "name": "Default"
    }
  ]
}
```

### Legacy Endpoints

For backward compatibility with v1.3.0:

```bash
GET /stories.json              # Full metadata dump
GET /stories.json/stats        # Statistics only
GET /stories.json/refresh      # Refresh instructions
```

---

## 📖 API Examples

### JavaScript/TypeScript

```typescript
// Get all components
const response = await fetch('http://localhost:6006/api/components');
const { components } = await response.json();

console.log(`Found ${components.length} components`);
components.forEach(comp => {
  console.log(`- ${comp.name}: ${comp.storyCount} stories`);
});

// Get specific component
const button = await fetch('http://localhost:6006/api/components/components-button');
const buttonData = await button.json();
console.log(buttonData.argTypes);

// Search
const results = await fetch('http://localhost:6006/api/search?q=input');
const { results: stories } = await results.json();
```

### Python

```python
import requests

# Get all components
r = requests.get('http://localhost:6006/api/components')
components = r.json()['components']

for comp in components:
    print(f"{comp['name']}: {comp['storyCount']} stories")

# Get component docs
docs_r = requests.get('http://localhost:6006/api/components/components-button/docs')
docs = docs_r.json()
print(f"Description: {docs['description']}")
```

### cURL

```bash
# Pretty print with jq
curl http://localhost:6006/api/components | jq

# Save to file
curl http://localhost:6006/api/stories > stories.json

# Search and filter
curl "http://localhost:6006/api/stories?title=button&tag=autodocs" | jq
```

---

## 📚 Swagger/OpenAPI Documentation

Complete OpenAPI 3.0 specification is included for all API endpoints!

### Files Included

- `swagger.yaml` - Full OpenAPI spec (17KB, human-readable)
- `swagger.json` - JSON format (7KB, machine-readable)

### View Documentation

#### Option 1: Online Swagger Editor (No Installation)

1. Go to https://editor.swagger.io/
2. Copy contents of `swagger.yaml`
3. Paste into editor
4. **Interactive documentation ready!**

#### Option 2: Swagger UI (Local)

```bash
npm install swagger-ui-express yamljs

# Quick server
node -e "
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const app = express();
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(YAML.load('./swagger.yaml')));
app.listen(3000, () => console.log('http://localhost:3000/api-docs'));
"
```

Open: http://localhost:3000/api-docs

#### Option 3: Postman

1. Open Postman
2. Click "Import"
3. Select `swagger.json`
4. All endpoints loaded → Test immediately!

#### Option 4: ReDoc (Beautiful Docs)

```bash
npm install -g redoc-cli
redoc-cli bundle swagger.yaml -o api-docs.html
open api-docs.html
```

### Generate Client Code

From Swagger Editor/UI, generate SDKs in **40+ languages**:
- JavaScript/TypeScript
- Python
- Java
- Go
- PHP
- Ruby
- C#
- And more...

Just click **"Generate Client"** and choose your language!

---

## 🧪 Testing

### Automated Test Suite

Run all tests:

```bash
cd storybook-api
./test-api.sh http://localhost:6006
```

**Expected output:**
```
🧪 Testing Storybook Metadata REST API
======================================
Test: Health Check
✅ PASS

Test: Get All Stories
✅ PASS

... (9 tests total)

======================================
📊 Test Results: 9 passed, 0 failed
🎉 All tests passed!
```

### Manual Testing

```bash
# Health check
curl http://localhost:6006/api/health

# List components
curl http://localhost:6006/api/components | jq

# Get component details
curl http://localhost:6006/api/components/components-button | jq

# Search
curl "http://localhost:6006/api/search?q=button" | jq

# Filter stories
curl "http://localhost:6006/api/stories?tag=autodocs" | jq
```

### Testing Checklist

- [ ] Health check returns 200 with metadata
- [ ] `/api/stories` returns array of stories
- [ ] `/api/components` returns array of components
- [ ] `/api/components/:id` returns specific component
- [ ] `/api/components/:id/docs` returns documentation
- [ ] `/api/components/:id/examples` returns code examples
- [ ] `/api/search?q=query` returns search results
- [ ] Query parameters work (title, tag, kind)
- [ ] CORS headers are present
- [ ] Error responses have correct status codes

---

## 📋 What Gets Extracted

### Complete Story Metadata

For each story, Storybook API captures:

- **`id`** - Unique story identifier
- **`title`** - Component title (e.g., "Components/Button")
- **`name`** - Story name (e.g., "Primary")
- **`kind`** - Story kind/category
- **`args`** - All argument values (props)
- **`argTypes`** - Control configurations (select, text, boolean, etc.)
- **`initialArgs`** - Default argument values
- **`actions`** - Event handlers (onClick, onChange, etc.)
- **`parameters`** - Design links (Figma), layout, backgrounds, viewport
- **`docs`** - Component descriptions and documentation
- **`source`** - Full source code of the story
- **`tags`** - Story tags (autodocs, dev, test, etc.)
- **`importPath`** - Source file path
- **`component`** - Component reference

### Example Output

```json
{
  "totalStories": 405,
  "generatedAt": "2025-12-15T10:00:00.000Z",
  "storybookVersion": "8.0.0",
  "extractedFrom": "source-files",
  "stories": {
    "components-button--default": {
      "id": "components-button--default",
      "title": "Components/Button",
      "name": "Default",
      "kind": "Components/Button",
      "story": "Default",
      "importPath": "./src/Button.stories.tsx",
      "tags": ["autodocs", "test"],
      "args": {
        "variant": "contained",
        "size": "medium",
        "color": "primary",
        "disabled": false
      },
      "argTypes": {
        "variant": {
          "control": { "type": "select" },
          "options": ["contained", "outlined", "text"],
          "description": "Button variant"
        },
        "size": {
          "control": { "type": "select" },
          "options": ["small", "medium", "large"]
        }
      },
      "actions": {
        "onClick": { "name": "onClick", "action": "onClick" }
      },
      "parameters": {
        "design": {
          "type": "figma",
          "url": "https://www.figma.com/file/..."
        },
        "fileName": "./src/Button.stories.tsx"
      },
      "source": "export const Default = Template.bind({});",
      "docs": {
        "description": "The default button state",
        "sourceCode": "..."
      }
    }
  }
}
```

---

## 🐛 Troubleshooting

### "Metadata not found" (404)

**Cause:** Metadata hasn't been generated yet.

**Solution:**
```bash
# Run metadata extraction
npm run metadata:dev
```

### "configuration.output has an unknown property 'previewMiddleware'" Error

**Cause:** The `previewMiddleware` was incorrectly placed inside `webpackFinal`.

**Solution:** Move `previewMiddleware` to the root level of your `.storybook/main.js`:

```javascript
// ❌ WRONG - inside webpackFinal
export default {
  webpackFinal: async (config) => {
    config.output = {
      ...config.output,
      previewMiddleware: middleware, // ❌ Don't put it here!
    };
    return config;
  }
};

// ✅ CORRECT - at config root level
export default {
  stories: [...],
  addons: [...],
  previewMiddleware: middleware, // ✅ Put it here!
  webpackFinal: async (config) => {
    // ... webpack config ...
    return config;
  }
};
```

### "require is not defined in ES module scope" Error

**Cause:** Your `.storybook` folder is using ES modules but Node.js doesn't know to treat `.js` files as ES modules.

**Solution:** Create `.storybook/package.json`:

```json
{
  "type": "module"
}
```

**Note:** The setup script now creates this automatically!

### Port Detection Issues

**Storybook API automatically detects which port Storybook is running on** by checking common ports (6006, 6007, 6008, 6009, 9009, 9001, 8080).

If auto-detection fails, you can specify the port manually:

```bash
# Option 1: Command line flag
node .storybook/extract-metadata.js --dev --port=6007

# Option 2: Environment variable
STORYBOOK_PORT=6007 npm run metadata:dev

# Option 3: Update package.json script
"metadata:dev": "STORYBOOK_PORT=6007 node .storybook/extract-metadata.js --dev"
```

### Empty Args/ArgTypes in Response

**Cause:** Stories don't define `args` or `argTypes`.

**Solution:** Make sure your stories export args:

```typescript
export default {
  title: 'Components/Button',
  component: Button,
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['primary', 'secondary']
    }
  }
} as Meta;

export const Default = Template.bind({});
Default.args = {
  variant: 'primary',
  size: 'medium'
};
```

### Storybook Fails to Start

**Cause:** Middleware configuration error.

**Solution:**
1. Check `.storybook/main.js` has `previewMiddleware: middleware` at root level
2. Verify `middleware.js` was copied to `.storybook/`
3. For ESM projects, ensure `.storybook/package.json` exists with `{"type": "module"}`
4. Restart Storybook

---

## 🔧 Configuration

### Custom Output Location

Edit `.storybook/extract-metadata.js`:

```javascript
const CONFIG = {
  storybookUrl: 'http://localhost:6006',
  outputDir: path.join(__dirname, '../custom-output'),
  outputFile: 'metadata.json',
  timeout: 30000,
};
```

### Custom Metadata Paths

The middleware checks these locations in order:

1. `storybook-static/stories.json`
2. `.storybook-metadata-temp.json`
3. `.storybook/stories.json`
4. `process.cwd()/storybook-static/stories.json`

To add custom paths, edit `.storybook/middleware.js`:

```javascript
const possiblePaths = [
  path.join(dirname, '../storybook-static/stories.json'),
  path.join(dirname, '../your-custom-path/metadata.json'), // Add here
  // ... other paths
];
```

---

## 🔄 Compatibility

### Storybook Versions

| Version | Supported | Notes |
|---------|-----------|-------|
| 8.x | ✅ Yes | Fully tested |
| 7.x | ✅ Yes | Fully tested |
| 6.x | ⚠️ Maybe | Not tested, might work |

### UI Frameworks

| Framework | Supported | Notes |
|-----------|-----------|-------|
| React | ✅ Yes | `.tsx`, `.jsx` |
| Vue | ✅ Yes | `.js`, `.ts` |
| Angular | ✅ Yes | `.ts` |
| Svelte | ✅ Yes | `.js`, `.ts` |
| Web Components | ✅ Yes | `.js` |
| HTML | ✅ Yes | `.js` |
| Ember | ✅ Yes | `.js` |
| Preact | ✅ Yes | `.jsx` |

### Module Systems

| System | Supported | Notes |
|--------|-----------|-------|
| ES Modules (ESM) | ✅ Yes | Preferred |
| CommonJS (CJS) | ✅ Yes | Supported |
| Mixed | ✅ Yes | Auto-detected |

### Build Tools

| Tool | Supported | Notes |
|------|-----------|-------|
| Webpack | ✅ Yes | Tested |
| Vite | ✅ Yes | Tested |
| esbuild | ✅ Yes | Supported |
| Rollup | ✅ Yes | Should work |
| Parcel | ✅ Yes | Should work |

### Node.js

- **Required:** Node.js 16.0.0+
- **Recommended:** Node.js 18.0.0+

---

## 🚀 Production Considerations

### Security

The middleware includes several security features for production use:

#### CORS Configuration

By default, CORS is set to `*` (allow all origins) for easy development. For production, restrict CORS to specific origins:

```bash
# Set allowed origins (comma-separated)
export STORYBOOK_CORS_ORIGIN="https://yourdomain.com,https://app.yourdomain.com"

# Or in your .env file
STORYBOOK_CORS_ORIGIN=https://yourdomain.com
```

#### Input Validation

All user inputs are validated and sanitized:
- Query parameters are length-limited (max 2048 chars for query string, 200 chars for search)
- Component IDs are validated (alphanumeric, hyphens, underscores only)
- Path traversal protection for file system operations

#### Security Headers

The API automatically includes security headers:
- `X-Content-Type-Options: nosniff`
- `Access-Control-Allow-Origin` (configurable)
- `Cache-Control` headers

### Performance

#### Caching

Metadata is cached in memory with a configurable TTL (default: 5 seconds):

```bash
# Set cache TTL in milliseconds
export STORYBOOK_CACHE_TTL=10000  # 10 seconds

# Disable caching (not recommended)
export STORYBOOK_CACHE_TTL=0
```

**Note:** Cache is automatically invalidated when metadata files are updated.

#### Optimization Tips

1. **For high-traffic APIs:** Consider using a reverse proxy (nginx, Cloudflare) for additional caching
2. **For large Storybooks:** The in-memory cache helps, but monitor memory usage
3. **For production builds:** Metadata is generated once during build, reducing runtime overhead

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `STORYBOOK_CORS_ORIGIN` | `*` | Allowed CORS origins (comma-separated) |
| `STORYBOOK_CACHE_TTL` | `5000` | Cache TTL in milliseconds |
| `STORYBOOK_PORT` | `6006` | Storybook port for metadata extraction |
| `STORYBOOK_URL` | `http://localhost:6006` | Full Storybook URL |

### Monitoring

The API includes basic error logging:
- Errors are logged to console with status codes
- 4xx errors (client errors) are logged as warnings
- 5xx errors (server errors) are logged as errors

For production monitoring, consider:
- Adding structured logging (Winston, Pino)
- Integrating with monitoring services (Datadog, New Relic)
- Setting up health check endpoints (already available at `/api/health`)

### Rate Limiting

The current implementation does not include rate limiting. For high-traffic production APIs, consider:
- Adding rate limiting middleware (express-rate-limit)
- Using a reverse proxy with rate limiting (nginx, Cloudflare)
- Implementing request throttling based on your needs

### Best Practices

1. **Restrict CORS** in production environments
2. **Monitor cache hit rates** to optimize TTL
3. **Set up alerts** for 5xx errors
4. **Use HTTPS** in production
5. **Review logs regularly** for suspicious activity
6. **Keep dependencies updated** for security patches

---

## 📝 Changelog

### [1.0.0] - 2025-12-26

**Initial npm release** 🎉

This is the first public release of `storybook-api` on npm. The package includes all features developed during internal development.

#### Features
- 🌐 **Comprehensive REST API** with 7 endpoints
- 📚 **OpenAPI/Swagger documentation** (swagger.yaml, swagger.json)
- 🔍 **Component search** functionality
- 📖 **Documentation endpoint** for component docs
- 💡 **Examples endpoint** for code examples and usage
- 🔎 **Query parameter filtering** (title, tag, kind)
- 🧪 **Automated test suite** (test-api.sh)
- ⚡ **Fast extraction** (~5 seconds for 400+ stories)
- 🔒 **Production-ready security** (CORS, input validation, path protection)
- ⚡ **Performance optimizations** (in-memory caching)
- 🛡️ **Security headers** and error handling

#### Previous Development Versions

The following versions were used during internal development:

### [1.4.1] - 2025-12-26 (Development)

#### Added
- 🔒 **Security improvements**: Configurable CORS, input validation, path traversal protection
- ⚡ **Performance**: In-memory caching with configurable TTL
- 🛡️ **Security headers**: X-Content-Type-Options and proper CORS headers
- 📊 **Error handling**: Structured error responses with logging
- 🔍 **Input sanitization**: Query parameter validation and length limits

#### Changed
- Enhanced error handling with try-catch blocks on all endpoints
- Improved security with path validation for file operations
- Better error messages with timestamps and helpful details

### [1.4.0] - 2025-12-15

#### Added
- 🌐 **Comprehensive REST API** with 7 endpoints
- 📚 **OpenAPI/Swagger documentation** (swagger.yaml, swagger.json)
- 🔍 **Component search** functionality
- 📖 **Documentation endpoint** for component docs
- 💡 **Examples endpoint** for code examples and usage
- 🔎 **Query parameter filtering** (title, tag, kind)
- 🧪 **Automated test suite** (test-api.sh)
- 📊 **CORS support** for cross-origin requests

#### Changed
- Enhanced middleware with full REST API support
- Improved error messages with helpful instructions
- Better code organization and comments
- More maintainable structure (DRY principle)

#### Fixed
- Indentation consistency throughout codebase
- Removed code duplication with helper functions
- CORS headers for easy integration
- Module system compatibility (ESM/CommonJS)

### [1.3.0] - 2025-12-10

#### Added
- ⚡ Source file parsing for faster extraction (~5 seconds for 400+ stories)
- 🔍 Auto-detection of Storybook port
- 📊 Complete deep metadata extraction
- 🔧 Multiple extraction methods (source parsing, HTTP, built Storybook)

### [1.0.0] - 2025-12-01

#### Added
- Initial release
- Basic metadata extraction
- Middleware for serving stories.json
- Setup script for automatic installation

---

## 🎯 Use Cases

With this tool and its REST API, you can:

- **🤖 AI Integration** - Feed component data to AI models and LLMs
- **📚 Documentation Sites** - Build custom component documentation
- **🔍 Search & Discovery** - Create searchable component libraries
- **📱 Mobile Apps** - Access Storybook from native mobile applications
- **🧪 Automated Testing** - Test components programmatically
- **📊 Analytics Dashboards** - Track component usage patterns
- **⚡ Code Generation** - Generate code from component examples
- **🔗 Microservices** - Use as a component catalog API service
- **🎨 Design Tools** - Sync with Figma, Sketch, or other design tools
- **📖 SDK Generation** - Auto-generate client SDKs in any language

---

## 📈 Performance

Tested with a large Storybook project:

- **Stories:** 405
- **Extraction Time:** ~5 seconds (source parsing)
- **API Response Time:** < 10ms per request
- **Success Rate:** 100%
- **Memory Usage:** Minimal (metadata cached)
- **Concurrent Requests:** Handles hundreds simultaneously

**Comparison:**

| Method | Time | Completeness |
|--------|------|--------------|
| Source Parsing | 5 sec | 100% ✅ |
| Browser Automation | 15-20 min | 70% (timeouts) |
| HTTP Endpoint | < 1 sec | Basic only |

---

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

### Ways to Contribute

- 🐛 Report bugs
- 💡 Suggest new features
- 📝 Improve documentation
- 🔧 Submit pull requests
- ⭐ Star the repo if it helps you!

### Development Setup

```bash
# Clone the repo
git clone https://github.com/Hrishikesh410/storybook-api.git
cd storybook-api

# Install dependencies
npm install

# Test in a Storybook project
cd path/to/test-storybook
npm install storybook-api --save-dev
npx storybook-api-setup

# Make changes and test
npm run storybook
npm run metadata:dev
./test-api.sh http://localhost:6006
```

### Code Style

- Use 2 spaces for indentation
- Add JSDoc comments for new functions
- Keep it simple and readable
- Write tests for new features
- Update documentation

---

## 📄 License

MIT License - Feel free to use this in any project!

Copyright (c) 2025

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

---

## 🙏 Acknowledgments

- Built for the Storybook community
- Inspired by the need for programmatic access to component metadata
- Thanks to all contributors and users!

---

## 📞 Support

- **Issues:** Open an issue on GitHub
- **Questions:** Check the troubleshooting section above
- **Documentation:** You're reading it! 📚

---

**Made with ❤️ for developers who automate documentation**

**Version:** 1.0.0  
**Status:** Production Ready ✅  
**Last Updated:** December 26, 2025

If this tool helped you, consider giving it a ⭐!
