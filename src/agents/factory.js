import { BusinessAgent } from './businessAgent.js';

export class AgentFactory {
  constructor(db) {
    this.db = db;
    this.drafts = new Map();
  }

  createDraft(ownerUserId, businessName, category) {
    const agent = new BusinessAgent({
      ownerUserId,
      name: businessName,
      category,
      status: 'DRAFT'
    });

    this.drafts.set(agent.id, {
      agent,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    return agent;
  }

  collectData(agentId, data) {
    const record = this.drafts.get(agentId);
    if (!record) throw new Error(`Draft agent ${agentId} not found`);

    const agent = record.agent;
    if (data.location) agent.location = { ...agent.location, ...data.location };
    if (data.catalog) agent.catalog = [...agent.catalog, ...data.catalog];
    if (data.policies) agent.policies = { ...agent.policies, ...data.policies };
    if (data.paymentInfo) agent.paymentInfo = { ...agent.paymentInfo, ...data.paymentInfo };

    agent.status = 'COLLECTING';
    record.updatedAt = Date.now();
    return agent;
  }

  validateConfig(agent) {
    agent.status = 'VALIDATING';
    const errors = [];

    if (!agent.name || agent.name.trim().length === 0) errors.push('Business name is required');
    if (!agent.ownerUserId) errors.push('Owner user ID is required');
    if (!agent.catalog || agent.catalog.length === 0) errors.push('Catalog must have at least one product/service');

    if (errors.length > 0) {
      agent.status = 'COLLECTING';
      return { valid: false, errors };
    }

    return { valid: true, errors: [] };
  }

  activate(agentId) {
    const record = this.drafts.get(agentId);
    if (!record) throw new Error(`Draft agent ${agentId} not found`);

    const validation = this.validateConfig(record.agent);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    record.agent.status = 'ACTIVE';
    record.updatedAt = Date.now();
    return record.agent;
  }

  async cleanupExpiredDrafts(maxAgeMs = 48 * 60 * 60 * 1000) {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [id, record] of this.drafts.entries()) {
      if (record.agent.status !== 'ACTIVE' && (now - record.updatedAt) > maxAgeMs) {
        this.drafts.delete(id);
        cleanedCount++;
      }
    }

    if (this.db) {
      const cutoff = now - maxAgeMs;
      await this.db.prepare(
        `DELETE FROM agents WHERE status != 'ACTIVE' AND updated_at < ?`
      ).bind(cutoff).run();
    }

    return { cleanedCount };
  }
}
