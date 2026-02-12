import "dotenv/config";
import { Client } from "@microsoft/microsoft-graph-client";
import { ClientSecretCredential } from "@azure/identity";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js";

const GRAPH_SCOPE = "https://graph.microsoft.com/.default";

let cachedClient: Client | null = null;

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getGraphClient(): Client {
  if (cachedClient) {
    return cachedClient;
  }

  const tenantId = getRequiredEnv("AZURE_TENANT_ID");
  const clientId = getRequiredEnv("AZURE_CLIENT_ID");
  const clientSecret = getRequiredEnv("AZURE_CLIENT_SECRET");

  const credential = new ClientSecretCredential(
    tenantId,
    clientId,
    clientSecret,
  );
  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: [GRAPH_SCOPE],
  });

  cachedClient = Client.initWithMiddleware({
    authProvider,
    defaultVersion: "v1.0",
  });

  return cachedClient;
}
