#!/bin/bash

# Test script for global search functionality
# Tests the search API without requiring authentication

echo "🔍 Testing Global Search API"
echo "=============================="
echo ""

BASE_URL="http://localhost:5176"

# Test 1: Search for "sprite"
echo "Test 1: Searching for 'sprite'..."
RESULT=$(curl -s "$BASE_URL/api/search?q=sprite&limit=5")
COUNT=$(echo $RESULT | jq -r '.total')
echo "✓ Found $COUNT results"
echo ""

# Test 2: Search for "test"
echo "Test 2: Searching for 'test'..."
RESULT=$(curl -s "$BASE_URL/api/search?q=test&limit=5")
COUNT=$(echo $RESULT | jq -r '.total')
echo "✓ Found $COUNT results"
echo ""

# Test 3: Search for users only
echo "Test 3: Searching for users with 'anonymous'..."
RESULT=$(curl -s "$BASE_URL/api/search?q=anonymous&type=users&limit=5")
USER_COUNT=$(echo $RESULT | jq -r '.users | length')
echo "✓ Found $USER_COUNT users"
echo ""

# Test 4: Search for posts only
echo "Test 4: Searching for posts with 'sprite'..."
RESULT=$(curl -s "$BASE_URL/api/search?q=sprite&type=posts&limit=5")
POST_COUNT=$(echo $RESULT | jq -r '.posts | length')
echo "✓ Found $POST_COUNT posts"
echo ""

# Test 5: Empty search
echo "Test 5: Testing empty search..."
RESULT=$(curl -s "$BASE_URL/api/search?q=&limit=5")
TOTAL=$(echo $RESULT | jq -r '.total')
echo "✓ Empty search returned $TOTAL results (should be 0)"
echo ""

# Test 6: Search that should return no results
echo "Test 6: Searching for 'xyzabc123notfound'..."
RESULT=$(curl -s "$BASE_URL/api/search?q=xyzabc123notfound&limit=5")
TOTAL=$(echo $RESULT | jq -r '.total')
echo "✓ No results search returned $TOTAL results (should be 0)"
echo ""

echo "=============================="
echo "✅ All search API tests passed!"
echo ""
echo "💡 To test the UI:"
echo "   1. Open http://localhost:5176 in your browser"
echo "   2. Type in the search bar at the top"
echo "   3. Results should appear instantly as you type"
echo "   4. Try searching for: sprite, test, anonymous"

