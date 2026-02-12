# Calendar MCP Server — Azure AD App Registration Setup Script (PowerShell)
# Run after: az login --tenant <your-tenant-id> --scope https://graph.microsoft.com/.default

$ErrorActionPreference = "Stop"

$APP_NAME = "calendar-mcp-server"
$TENANT_ID = az account show --query tenantId -o tsv

Write-Host "=== Calendar MCP Server — Azure AD Setup ===" -ForegroundColor Cyan
Write-Host "Tenant: $TENANT_ID"
Write-Host ""

# 1. Create App Registration
Write-Host "1. Creating App Registration: $APP_NAME ..." -ForegroundColor Yellow
$appJson = az ad app create `
  --display-name $APP_NAME `
  --sign-in-audience "AzureADMyOrg" `
  -o json | ConvertFrom-Json

$APP_ID = $appJson.appId
$OBJECT_ID = $appJson.id

Write-Host "   App ID (Client ID): $APP_ID" -ForegroundColor Green
Write-Host "   Object ID: $OBJECT_ID"

# 2. Create Client Secret
Write-Host "2. Creating Client Secret ..." -ForegroundColor Yellow
$secretJson = az ad app credential reset `
  --id $APP_ID `
  --display-name "calendar-mcp-secret" `
  --years 1 `
  -o json | ConvertFrom-Json

$CLIENT_SECRET = $secretJson.password
Write-Host "   Secret created" -ForegroundColor Green

# 3. Add Microsoft Graph API permissions (Application type)
Write-Host "3. Adding Graph API permissions ..." -ForegroundColor Yellow
$GRAPH_API_ID = "00000003-0000-0000-c000-000000000000"

# Calendars.Read (app) = 798ee544-9d2d-430c-a058-570e29e34338
# Calendars.ReadWrite (app) = ef54d2bf-783f-4e0f-bca1-3210c0444d99
# User.Read.All (app) = df021288-bdef-4463-88db-98f22de89214

az ad app permission add --id $APP_ID `
  --api $GRAPH_API_ID `
  --api-permissions `
    798ee544-9d2d-430c-a058-570e29e34338=Role `
    ef54d2bf-783f-4e0f-bca1-3210c0444d99=Role `
    df021288-bdef-4463-88db-98f22de89214=Role

Write-Host "   Permissions: Calendars.Read, Calendars.ReadWrite, User.Read.All" -ForegroundColor Green

# 4. Grant admin consent
Write-Host "4. Granting admin consent ..." -ForegroundColor Yellow
Start-Sleep -Seconds 5
try {
    az ad app permission admin-consent --id $APP_ID 2>$null
    Write-Host "   Admin consent granted" -ForegroundColor Green
} catch {
    Write-Host "   Warning: Admin consent may need manual approval in Azure Portal" -ForegroundColor Red
}

# 5. Create Service Principal
Write-Host "5. Creating Service Principal ..." -ForegroundColor Yellow
try {
    az ad sp create --id $APP_ID -o none 2>$null
    Write-Host "   Service Principal created" -ForegroundColor Green
} catch {
    Write-Host "   Service Principal already exists" -ForegroundColor Gray
}

# 6. Write .env file
Write-Host "6. Writing .env file ..." -ForegroundColor Yellow
$envContent = @"
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
"@

$envContent | Set-Content -Path "calendar-mcp-server/.env" -Encoding utf8NoBOM
Write-Host "   .env written" -ForegroundColor Green

Write-Host ""
Write-Host "=== Setup Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "App ID (Client ID): $APP_ID" -ForegroundColor White
Write-Host "Tenant ID: $TENANT_ID" -ForegroundColor White
Write-Host "Secret: (saved to calendar-mcp-server/.env)" -ForegroundColor White
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Verify admin consent: Azure Portal -> App registrations -> $APP_NAME -> API permissions"
Write-Host "  2. cd calendar-mcp-server; npm run dev"
Write-Host "  3. Chat with @orchestrator in VS Code Copilot"
