import { scrapeOrdev } from "./adapters/puppeteer/ordev.js";
import { scrapeOrderin } from "./adapters/puppeteer/orderin.js";
import { scrapeYobee } from "./adapters/puppeteer/yobee.js";
import { scrapeShopify } from "./adapters/puppeteer/shopify.js";
import { scrapeWooCommerce } from "./adapters/puppeteer/woo.js";
import { scrapeMagento } from "./adapters/puppeteer/magento.js";
import { scrapeCustom } from "./adapters/puppeteer/custom.js";

import { fetchOnecart } from "./adapters/fetch/onecart.js";
import { fetchTakealot } from "./adapters/fetch/takealot.js";
import { fetchPnp } from "./adapters/fetch/pnp.js";
import { fetchWoolies } from "./adapters/fetch/woolies.js";
import { fetchSixty60 } from "./adapters/fetch/sixty60.js";
import { fetchMrd } from "./adapters/fetch/mrd.js";
import { fetchUbereats } from "./adapters/fetch/ubereats.js";

export const PUPPETEER_ADAPTERS = {
  Ordev: scrapeOrdev,
  Orderin: scrapeOrderin,
  Yobee: scrapeYobee,
  Shopify: scrapeShopify,
  WooCommerce: scrapeWooCommerce,
  Magento: scrapeMagento,
  Custom: scrapeCustom
};

export const FETCH_ADAPTERS = {
  Onecart: fetchOnecart,
  Takealot: fetchTakealot,
  Pnp: fetchPnp,
  Woolies: fetchWoolies,
  Sixty60: fetchSixty60,
  Mrd: fetchMrd,
  Ubereats: fetchUbereats
};

export async function scrapeStoreMenuRouter(storeId, query = "") {
  // First dynamically iterate over fast fetch adapters
  for (const fetchAdapter of Object.values(FETCH_ADAPTERS)) {
    try {
      const menu = await fetchAdapter(storeId);
      if (Array.isArray(menu) && menu.length > 0) {
        return menu;
      }
    } catch (e) {
      // ignore
    }
  }

  // Fallback: match known store IDs to appropriate Puppeteer adapter, or try all
  if (storeId.includes("clicks") || storeId.includes("shopify")) return await PUPPETEER_ADAPTERS.Shopify(storeId);
  if (storeId.includes("vet") || storeId.includes("woo")) return await PUPPETEER_ADAPTERS.WooCommerce(storeId);
  if (storeId.includes("steers") || storeId.includes("orderin")) return await PUPPETEER_ADAPTERS.Orderin(storeId);
  if (storeId.includes("mcd") || storeId.includes("yobee")) return await PUPPETEER_ADAPTERS.Yobee(storeId);

  for (const puppeteerAdapter of Object.values(PUPPETEER_ADAPTERS)) {
    try {
      const menu = await puppeteerAdapter(storeId);
      if (Array.isArray(menu) && menu.length > 0) {
        return menu;
      }
    } catch (e) {
      // ignore
    }
  }

  return [];
}
