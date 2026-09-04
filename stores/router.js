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
  // Check fast fetch adapters if specific match exists
  if (storeId.includes("pnp")) return await FETCH_ADAPTERS.Pnp(storeId);
  if (storeId.includes("takealot")) return await FETCH_ADAPTERS.Takealot(storeId);
  if (storeId.includes("sixty60")) return await FETCH_ADAPTERS.Sixty60(storeId);
  if (storeId.includes("woolies")) return await FETCH_ADAPTERS.Woolies(storeId);
  if (storeId.includes("onecart")) return await FETCH_ADAPTERS.Onecart(storeId);
  if (storeId.includes("mrd")) return await FETCH_ADAPTERS.Mrd(storeId);
  if (storeId.includes("ubereats")) return await FETCH_ADAPTERS.Ubereats(storeId);

  // Fallback to Puppeteer scrapers for Shopify (Clicks), WooCommerce (Vet), Ordev (KFC/General)
  try {
    if (storeId.includes("clicks")) {
      return await PUPPETEER_ADAPTERS.Shopify(storeId);
    }
    if (storeId.includes("vet")) {
      return await PUPPETEER_ADAPTERS.WooCommerce(storeId);
    }
    return await PUPPETEER_ADAPTERS.Ordev(storeId);
  } catch (err) {
    console.error(`Router error for ${storeId}, using fallback:`, err);
    return [
      { id: "kfc_s2", name: "Streetwise 2 with Chips", price: 49.9, weightKg: 0.5, category: "Meals", img: "https://r2.mrcheaper.co.za/kfc_s2_thumb.jpg", badge: "Popular" }
    ];
  }
}
