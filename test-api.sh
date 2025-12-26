#!/bin/bash

# ======================================
# Storybook Metadata REST API Test Suite
# ======================================

BASE_URL="${1:-http://localhost:6006}"
TESTS_PASSED=0
TESTS_FAILED=0

echo "🧪 Testing Storybook Metadata REST API"
echo "======================================"
echo "Base URL: $BASE_URL"
echo ""

# Helper function to test endpoint
test_endpoint() {
  local test_name="$1"
  local url="$2"
  local expected_pattern="$3"
  
  echo "Test: $test_name"
  echo "URL: $url"
  
  RESPONSE=$(curl -s "$url")
  STATUS=$?
  
  if [ $STATUS -ne 0 ]; then
    echo "❌ FAIL - Connection error"
    echo ""
    ((TESTS_FAILED++))
    return
  fi
  
  if echo "$RESPONSE" | grep -q "$expected_pattern"; then
    echo "✅ PASS"
    echo ""
    ((TESTS_PASSED++))
  else
    echo "❌ FAIL - Expected pattern not found: $expected_pattern"
    echo "Response: ${RESPONSE:0:200}..."
    echo ""
    ((TESTS_FAILED++))
  fi
}

# Run tests
echo "Running API Tests..."
echo ""

# Test 1: Health Check
test_endpoint \
  "Health Check" \
  "${BASE_URL}/api/health" \
  "status"

# Test 2: Get All Stories
test_endpoint \
  "Get All Stories" \
  "${BASE_URL}/api/stories" \
  "total"

# Test 3: Get Components
test_endpoint \
  "Get Components List" \
  "${BASE_URL}/api/components" \
  "components"

# Test 4: Search
test_endpoint \
  "Search Stories" \
  "${BASE_URL}/api/search?q=button" \
  "query"

# Test 5: Filter Stories by Tag
test_endpoint \
  "Filter Stories by Tag" \
  "${BASE_URL}/api/stories?tag=autodocs" \
  "filtered"

# Test 6: Legacy Endpoint
test_endpoint \
  "Legacy /stories.json" \
  "${BASE_URL}/stories.json" \
  "stories"

# Test 7: Legacy Stats
test_endpoint \
  "Legacy /stories.json/stats" \
  "${BASE_URL}/stories.json/stats" \
  "totalStories"

# Test 8: Error Handling - Bad Search
echo "Test: Error Handling - Missing Query Param"
echo "URL: ${BASE_URL}/api/search"
RESPONSE=$(curl -s "${BASE_URL}/api/search")
if echo "$RESPONSE" | grep -q "error"; then
  echo "✅ PASS - Error response correct"
  echo ""
  ((TESTS_PASSED++))
else
  echo "❌ FAIL - Expected error response"
  echo ""
  ((TESTS_FAILED++))
fi

# Test 9: CORS Headers
echo "Test: CORS Headers Present"
HEADERS=$(curl -s -I "${BASE_URL}/api/health")
if echo "$HEADERS" | grep -qi "access-control-allow-origin"; then
  echo "✅ PASS - CORS headers present"
  echo ""
  ((TESTS_PASSED++))
else
  echo "❌ FAIL - CORS headers missing"
  echo ""
  ((TESTS_FAILED++))
fi

# Summary
echo "======================================"
echo "📊 Test Results"
echo "======================================"
echo "Total Tests: $((TESTS_PASSED + TESTS_FAILED))"
echo "✅ Passed: $TESTS_PASSED"
echo "❌ Failed: $TESTS_FAILED"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo "🎉 All tests passed!"
  echo ""
  echo "Your Storybook Metadata REST API is working perfectly!"
  echo ""
  echo "Available endpoints:"
  echo "  - ${BASE_URL}/api/health"
  echo "  - ${BASE_URL}/api/stories"
  echo "  - ${BASE_URL}/api/components"
  echo "  - ${BASE_URL}/api/components/:id"
  echo "  - ${BASE_URL}/api/components/:id/docs"
  echo "  - ${BASE_URL}/api/components/:id/examples"
  echo "  - ${BASE_URL}/api/search?q=query"
  exit 0
else
  echo "❌ Some tests failed"
  echo ""
  echo "Troubleshooting:"
  echo "  1. Make sure Storybook is running"
  echo "  2. Run metadata extraction: npm run metadata:dev"
  echo "  3. Check if middleware is configured in .storybook/main.js"
  echo "  4. Restart Storybook if needed"
  exit 1
fi

