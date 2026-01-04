#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

BASE_URL="${WORKSPACE_DAEMON_URL:-http://localhost:8888}"

echo "Testing workspace-daemon at $BASE_URL"
echo ""

# Health check
echo -n "Health check... "
HEALTH=$(curl -s "$BASE_URL/api/v1/health")
if echo "$HEALTH" | grep -q '"status":"ok"'; then
    echo -e "${GREEN}PASS${NC}"
else
    echo -e "${RED}FAIL${NC}: $HEALTH"
    exit 1
fi

# List workspaces (should be empty or have existing)
echo -n "List workspaces... "
LIST=$(curl -s "$BASE_URL/api/v1/workspaces")
if echo "$LIST" | grep -q '"data":'; then
    echo -e "${GREEN}PASS${NC}"
else
    echo -e "${RED}FAIL${NC}: $LIST"
    exit 1
fi

# Create workspace
echo -n "Create workspace... "
CREATE=$(curl -s -X POST "$BASE_URL/api/v1/workspaces" \
    -H "Content-Type: application/json" \
    -d '{"name":"integration-test"}')
if echo "$CREATE" | grep -q '"name":"integration-test"'; then
    echo -e "${GREEN}PASS${NC}"
    WS_ID=$(echo "$CREATE" | jq -r '.data.id')
    echo "  Created workspace: $WS_ID"
else
    echo -e "${RED}FAIL${NC}: $CREATE"
    exit 1
fi

# Get workspace
echo -n "Get workspace... "
GET=$(curl -s "$BASE_URL/api/v1/workspaces/$WS_ID")
if echo "$GET" | grep -q "\"id\":\"$WS_ID\""; then
    echo -e "${GREEN}PASS${NC}"
else
    echo -e "${RED}FAIL${NC}: $GET"
fi

# Stop workspace
echo -n "Stop workspace... "
STOP=$(curl -s -X POST "$BASE_URL/api/v1/workspaces/$WS_ID/stop")
if echo "$STOP" | grep -q '"status":"stopped"'; then
    echo -e "${GREEN}PASS${NC}"
else
    echo -e "${YELLOW}WARN${NC}: $STOP"
    echo "  (may fail if workspace was already stopped or orchestrator not configured)"
fi

# Start workspace
echo -n "Start workspace... "
START=$(curl -s -X POST "$BASE_URL/api/v1/workspaces/$WS_ID/start")
if echo "$START" | grep -q '"status":"running"'; then
    echo -e "${GREEN}PASS${NC}"
else
    echo -e "${YELLOW}WARN${NC}: $START"
    echo "  (may fail if orchestrator not configured)"
fi

# Get events
echo -n "Get events... "
EVENTS=$(curl -s "$BASE_URL/api/v1/workspaces/$WS_ID/events")
if echo "$EVENTS" | grep -q '"data":'; then
    echo -e "${GREEN}PASS${NC}"
    EVENT_COUNT=$(echo "$EVENTS" | jq '.data | length')
    echo "  Found $EVENT_COUNT events"
else
    echo -e "${RED}FAIL${NC}: $EVENTS"
fi

# Delete workspace
echo -n "Delete workspace... "
DELETE=$(curl -s -X DELETE "$BASE_URL/api/v1/workspaces/$WS_ID")
if echo "$DELETE" | grep -q '"message":'; then
    echo -e "${GREEN}PASS${NC}"
else
    echo -e "${RED}FAIL${NC}: $DELETE"
fi

# Verify workspace is gone
echo -n "Verify deletion... "
VERIFY=$(curl -s "$BASE_URL/api/v1/workspaces/$WS_ID")
if echo "$VERIFY" | grep -q '"error":'; then
    echo -e "${GREEN}PASS${NC}"
else
    echo -e "${YELLOW}WARN${NC}: Workspace may still exist"
fi

echo ""
echo -e "${GREEN}Integration tests completed!${NC}"
echo ""
echo "Note: Start/stop operations may fail if the orchestrator is not"
echo "configured with a valid Kubernetes connection. This is expected"
echo "in development environments without K8s."
