/**
 * Idempotency module backed by KV or in-memory fallback.
 */

export class IdempotencyManager {
  constructor(kvNamespace) {
    this.kv = kvNamespace;
    this.fallbackStore = new Map();
  }

  async checkAndLock(idempotencyKey, ttlSeconds = 86400) {
    if (!idempotencyKey) {
      throw new Error("Idempotency key is required");
    }

    const key = `idempotency:${idempotencyKey}`;

    if (this.kv) {
      const existing = await this.kv.get(key);
      if (existing) {
        return { isDuplicate: true, record: JSON.parse(existing) };
      }
      const initialRecord = { status: "PROCESSING", timestamp: Date.now() };
      await this.kv.put(key, JSON.stringify(initialRecord), { expirationTtl: ttlSeconds });
      return { isDuplicate: false, record: initialRecord };
    } else {
      if (this.fallbackStore.has(key)) {
        return { isDuplicate: true, record: this.fallbackStore.get(key) };
      }
      const initialRecord = { status: "PROCESSING", timestamp: Date.now() };
      this.fallbackStore.set(key, initialRecord);
      return { isDuplicate: false, record: initialRecord };
    }
  }

  async complete(idempotencyKey, responseData, ttlSeconds = 86400) {
    const key = `idempotency:${idempotencyKey}`;
    const record = { status: "COMPLETED", data: responseData, timestamp: Date.now() };

    if (this.kv) {
      await this.kv.put(key, JSON.stringify(record), { expirationTtl: ttlSeconds });
    } else {
      this.fallbackStore.set(key, record);
    }
    return record;
  }
}
