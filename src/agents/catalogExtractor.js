/**
 * Conversational Catalog Extractor for Agent Factory
 * Parses unstructured text, menu lists, and PDF data into structured product items.
 */

export class CatalogExtractor {
  /**
   * Parse menu/list text into structured catalog array.
   * e.g., "Streetwise 2 - R45, Burger Meal - R75"
   */
  parseTextToCatalog(rawText) {
    if (!rawText) return [];

    const items = [];
    // Split by line or semicolon/comma
    const lines = rawText.split(/[\n;]/);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Regex match product name and Rand price (e.g. "Pizza - R120" or "Burger R85.50")
      const match = trimmed.match(/(.+?)(?:-|\:|\s+)*R\s?([0-9]+(?:\.[0-9]{2})?)/i);

      if (match) {
        const name = match[1].trim();
        const priceRands = parseFloat(match[2]);
        const priceCents = Math.round(priceRands * 100);

        items.push({
          id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          name,
          priceCents,
          category: this.inferCategory(name)
        });
      }
    }

    return items;
  }

  inferCategory(name) {
    const n = name.toLowerCase();
    if (n.includes('burger') || n.includes('pizza') || n.includes('meal') || n.includes('fries') || n.includes('chicken')) {
      return 'Food';
    }
    if (n.includes('milk') || n.includes('bread') || n.includes('cheese') || n.includes('egg')) {
      return 'Groceries';
    }
    if (n.includes('couch') || n.includes('table') || n.includes('chair') || n.includes('bed')) {
      return 'Furniture';
    }
    if (n.includes('phone') || n.includes('iphone') || n.includes('laptop') || n.includes('tv')) {
      return 'Electronics';
    }
    return 'General';
  }
}
