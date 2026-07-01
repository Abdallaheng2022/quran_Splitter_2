import { ReplitConnectors } from "@replit/connectors-sdk";
import { createClient, type Client } from "@replit/revenuecat-sdk/client";

// Bridges the @replit/revenuecat-sdk REST client through the Replit
// RevenueCat connector proxy (OAuth tokens injected + refreshed automatically).
// Never cache the returned client across requests — call this fresh each time.
export async function getUncachableRevenueCatClient(): Promise<Client> {
  const connectors = new ReplitConnectors();
  const proxyFetch = connectors.createProxyFetch("revenuecat");
  return createClient({
    baseUrl: "https://api.revenuecat.com/v2",
    fetch: proxyFetch,
  });
}
