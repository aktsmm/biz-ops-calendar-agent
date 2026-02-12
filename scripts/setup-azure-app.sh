#!/usr/bin/env bash
# Calendar MCP Server — Azure AD App Registration Setup Script
# Run after: az login --tenant <your-tenant-id> --scope https://graph.microsoft.com/.default

set -euo pipefail

APP_NAME="calendar-mcp-server"
TENANT_ID=$(az account show --query tenantId -o tsv)

echo "=== Calendar MCP Server — Azure AD Setup ==="
echo "Tenant: $TENANT_ID"
echo ""

# 1. Create App Registration
echo "1. Creating App Registration: $APP_NAME ..."
APP_JSON=$(az ad app create \
  --display-name "$APP_NAME" \
  --sign-in-audience "AzureADMyOrg" \
  --query "{appId:appId, id:id}" -o json)

APP_ID=$(echo "$APP_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['appId'])" 2>/dev/null || echo "$APP_JSON" | jq -r '.appId')
OBJECT_ID=$(echo "$APP_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "$APP_JSON" | jq -r '.id')

echo "   App ID (Client ID): $APP_ID"
echo "   Object ID: $OBJECT_ID"

# 2. Create Client Secret
echo "2. Creating Client Secret ..."
SECRET_JSON=$(az ad app credential reset \
  --id "$APP_ID" \
  --display-name "calendar-mcp-secret" \
  --years 1 \
  --query "{password:password}" -o json)

CLIENT_SECRET=$(echo "$SECRET_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['password'])" 2>/dev/null || echo "$SECRET_JSON" | jq -r '.password')

echo "   Secret created (saved below)"

# 3. Add Microsoft Graph API permissions (Application type)
echo "3. Adding Graph API permissions ..."
GRAPH_API_ID="00000003-0000-0000-c000-000000000000"

# Calendars.ReadBasic (app) = 8ba4a692-bc31-4128-9094-475571f38571  (not available as app permission, use Calendars.Read)
# Calendars.Read (app) = 798ee544-9d2d-430c-a058-570e29e34338
# Calendars.ReadWrite (app) = ef54d2bf-783f-4e0f-bca1-3210c0444d99
# User.Read.All (app) = df021288-bdef-4463-88db-98f22de89214
# Schedule.Read.All (app) (for getSchedule) = not available, use Calendars.Read

az ad app permission add --id "$APP_ID" \
  --api "$GRAPH_API_ID" \
  --api-permissions \
    798ee544-9d2d-430c-a058-570e29e34338=Role \
    ef54d2bf-783f-4e0f-bca1-3210c0444d99=Role \
    df021288-bdef-4463-88db-98f22de89214=Role

echo "   Permissions added: Calendars.Read, Calendars.ReadWrite, User.Read.All"

# 4. Grant admin consent
echo "4. Granting admin consent ..."
sleep 5  # Wait for propagation
az ad app permission admin-consent --id "$APP_ID" 2>/dev/null || \
  echo "   ⚠ Admin consent may require manual approval in Azure Portal"

# 5. Create Service Principal
echo "5. Creating Service Principal ..."
az ad sp create --id "$APP_ID" -o none 2>/dev/null || echo "   Service Principal already exists"

# 6. Write .env file
echo "6. Writing .env file ..."
cat > calendar-mcp-server/.env << EOF
# Azure AD App Registration
AZURE_TENANT_ID=$TENANT_ID
AZURE_CLIENT_ID=$APP_ID
AZURE_CLIENT_SECRET=$CLIENT_SECRET

# Server
PORT=3001

# Graph API
GRAPH_API_BASE_URL=https://graph.microsoft.com/v1.0

# Defaults
DEFAULT_TIMEZONE=Asia/Tokyo
WORKING_HOURS_START=09:00
WORKING_HOURS_END=18:00
EOF

echo ""
echo "=== Setup Complete ==="
echo ""
echo "App ID (Client ID): $APP_ID"
echo "Tenant ID: $TENANT_ID"
echo "Secret: (saved to calendar-mcp-server/.env)"
echo ""
echo "Next steps:"
echo "  1. Verify admin consent in Azure Portal → App registrations → $APP_NAME → API permissions"
echo "  2. cd calendar-mcp-server && npm run dev"
echo "  3. Test: curl -X POST http://localhost:3001/mcp -H 'Content-Type: application/json'"
