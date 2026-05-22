#!/bin/bash

##############################################################################
# API Gateway Test Script
# 
# Tests all endpoints and validation logic
# Usage: bash test-api.sh [BASE_URL]
##############################################################################

BASE_URL="${1:-http://localhost:3000}"
PASS_COUNT=0
FAIL_COUNT=0
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

##############################################################################
# Test Utilities
##############################################################################

test_pass() {
    echo -e "${GREEN}✓ PASS${NC}: $1"
    ((PASS_COUNT++))
}

test_fail() {
    echo -e "${RED}✗ FAIL${NC}: $1"
    echo "  Response: $2"
    ((FAIL_COUNT++))
}

test_endpoint() {
    local name="$1"
    local method="$2"
    local path="$3"
    local expected_status="$4"
    local data="$5"
    
    if [ -z "$data" ]; then
        response=$(curl -s -w "\n%{http_code}" -X "$method" "$BASE_URL$path" \
            -H "Content-Type: application/json")
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" "$BASE_URL$path" \
            -H "Content-Type: application/json" \
            -d "$data")
    fi
    
    status_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$status_code" -eq "$expected_status" ]; then
        test_pass "$name (status: $status_code)"
        echo "$body"
    else
        test_fail "$name (expected: $expected_status, got: $status_code)" "$body"
    fi
    
    echo ""
}

##############################################################################
# Test Suite
##############################################################################

echo "=================================================="
echo "API Gateway Test Suite"
echo "Base URL: $BASE_URL"
echo "=================================================="
echo ""

# Check connectivity
echo "Testing connectivity..."
if ! curl -s -f "$BASE_URL/health" > /dev/null 2>&1; then
    echo -e "${RED}✗ Cannot reach $BASE_URL${NC}"
    echo "Make sure the gateway is running:"
    echo "  npm run dev"
    exit 1
fi
echo -e "${GREEN}✓ Connected${NC}"
echo ""

# ==================== GET /health ====================
echo "========== GET /health =========="
test_endpoint "Health Check" "GET" "/health" 200

# ==================== GET /metrics ====================
echo "========== GET /metrics =========="
test_endpoint "Metrics" "GET" "/metrics" 200

# ==================== POST /infer - Valid Request ====================
echo "========== POST /infer - Valid Requests =========="

test_endpoint "Valid inference (minimal)" "POST" "/infer" 200 \
    '{"prompt": "What is 2+2?"}'

test_endpoint "Valid inference (with max_tokens)" "POST" "/infer" 200 \
    '{"prompt": "Hello", "max_tokens": 50}'

test_endpoint "Valid inference (with temperature)" "POST" "/infer" 200 \
    '{"prompt": "Hello", "temperature": 0.5}'

test_endpoint "Valid inference (all params)" "POST" "/infer" 200 \
    '{"prompt": "Hello", "max_tokens": 100, "temperature": 0.8}'

# ==================== POST /infer - Validation Errors ====================
echo "========== POST /infer - Validation Errors =========="

test_endpoint "Missing prompt (empty body)" "POST" "/infer" 400 '{}'

test_endpoint "Prompt is empty string" "POST" "/infer" 400 \
    '{"prompt": ""}'

test_endpoint "Prompt is whitespace" "POST" "/infer" 400 \
    '{"prompt": "   "}'

test_endpoint "max_tokens is 0 (too low)" "POST" "/infer" 400 \
    '{"prompt": "Hello", "max_tokens": 0}'

test_endpoint "max_tokens is 513 (too high)" "POST" "/infer" 400 \
    '{"prompt": "Hello", "max_tokens": 513}'

test_endpoint "temperature is -0.1 (too low)" "POST" "/infer" 400 \
    '{"prompt": "Hello", "temperature": -0.1}'

test_endpoint "temperature is 1.1 (too high)" "POST" "/infer" 400 \
    '{"prompt": "Hello", "temperature": 1.1}'

test_endpoint "max_tokens is string" "POST" "/infer" 400 \
    '{"prompt": "Hello", "max_tokens": "100"}'

test_endpoint "temperature is string" "POST" "/infer" 400 \
    '{"prompt": "Hello", "temperature": "0.5"}'

# ==================== POST /infer - Invalid JSON ====================
echo "========== POST /infer - Invalid JSON =========="

test_endpoint "Malformed JSON" "POST" "/infer" 400 \
    '{invalid json}'

test_endpoint "Missing closing quote" "POST" "/infer" 400 \
    '{"prompt: "Hello"}'

# ==================== 404 Handlers ====================
echo "========== 404 Errors =========="

test_endpoint "Non-existent endpoint" "GET" "/nonexistent" 404

test_endpoint "Wrong method" "DELETE" "/health" 404

# ==================== Request ID Tracing ====================
echo "========== Request ID Tracing =========="

CUSTOM_REQUEST_ID="test-request-$(date +%s)"
echo "Testing with custom request ID: $CUSTOM_REQUEST_ID"

response=$(curl -s -i -X POST "$BASE_URL/infer" \
    -H "Content-Type: application/json" \
    -H "X-Request-ID: $CUSTOM_REQUEST_ID" \
    -d '{"prompt": "Hello"}' 2>&1)

if echo "$response" | grep -q "X-Request-ID: $CUSTOM_REQUEST_ID"; then
    test_pass "Custom Request ID returned in response"
    echo "  ID: $CUSTOM_REQUEST_ID"
else
    test_fail "Custom Request ID not returned" "$response"
fi
echo ""

# ==================== Special Cases ====================
echo "========== Special Cases =========="

test_endpoint "Prompt with special characters" "POST" "/infer" 200 \
    '{"prompt": "What is €100 in £?"}'

test_endpoint "Prompt with newlines" "POST" "/infer" 200 \
    '{"prompt": "Line 1\nLine 2"}'

test_endpoint "Prompt with unicode" "POST" "/infer" 200 \
    '{"prompt": "你好世界"}'

test_endpoint "Very long prompt (1000 chars)" "POST" "/infer" 200 \
    "{\"prompt\": \"$(python3 -c 'print("a" * 1000)')\"}"

# ==================== Rate Limiting ====================
echo "========== Rate Limiting =========="
echo "Note: Rate limit is 60 requests/minute per IP (configurable)"
echo "This test just verifies the endpoint is still responsive"
test_endpoint "Endpoint still responsive" "GET" "/health" 200

# ==================== Summary ====================
echo "=================================================="
echo "Test Summary"
echo "=================================================="
echo -e "${GREEN}Passed: $PASS_COUNT${NC}"
echo -e "${RED}Failed: $FAIL_COUNT${NC}"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    exit 1
fi
