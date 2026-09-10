import { addCents } from './money.js';

export class DoubleEntryLedger {
  constructor(db) {
    this.db = db;
    this.inMemoryEntries = [];
  }

  /**
   * Record balanced double-entry transaction.
   * Debits must equal Credits.
   */
  async recordTransaction({ transactionId, idempotencyKey, entries, description = '' }) {
    if (!idempotencyKey) {
      throw new Error("Idempotency key required for ledger entry");
    }

    let totalDebit = 0;
    let totalCredit = 0;

    for (const entry of entries) {
      if (entry.type === 'DEBIT') {
        totalDebit = addCents(totalDebit, entry.amountCents);
      } else if (entry.type === 'CREDIT') {
        totalCredit = addCents(totalCredit, entry.amountCents);
      } else {
        throw new Error(`Invalid entry type ${entry.type}`);
      }
    }

    if (totalDebit !== totalCredit) {
      throw new Error(`Ledger imbalance: Total Debits (${totalDebit}) != Total Credits (${totalCredit})`);
    }

    if (this.db) {
      const stmt = this.db.prepare(
        `INSERT INTO ledger_entries (id, transaction_id, idempotency_key, account_debit, account_credit, amount_cents, description, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );

      for (const entry of entries) {
        if (entry.type === 'DEBIT') {
          const entryId = `led_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          await stmt.bind(
            entryId,
            transactionId,
            `${idempotencyKey}_${entry.account}`,
            entry.account,
            'BALANCING',
            entry.amountCents,
            description,
            Date.now()
          ).run();
        }
      }
    }

    this.inMemoryEntries.push({
      transactionId,
      idempotencyKey,
      entries,
      totalDebit,
      totalCredit,
      description,
      timestamp: Date.now()
    });

    return {
      success: true,
      transactionId,
      idempotencyKey,
      totalAmountCents: totalDebit
    };
  }

  getInMemoryEntries() {
    return this.inMemoryEntries;
  }
}
