import { BusinessAgent } from './businessAgent.js';

export class RuleBookDataLoader {
  static createRuleBookDeclaration(code, name, options = {}) {
    return Object.freeze({
      code,
      name,
      depth_layer_under: options.depth_layer_under || [],
      serves: options.serves || 'All users',
      problem: options.problem || '',
      core_functions: options.core_functions || [],
      price_fetchers: options.price_fetchers || [],
      boundary: options.boundary || 'mrAI prepares, routes, evidences. Registered professional certifies/advises.',
      monetisation: options.monetisation || 'free or flat preparation fee',
      line: options.line || '',
      evidence_chain: options.evidence_chain || [],
      escalation_ladder: options.escalation_ladder || [],
      regulators: options.regulators || [],
      binding_threshold: options.binding_threshold || 'user_approval',
      failure_mode: options.failure_mode || 'gap_declaration',
      memory_scope: options.memory_scope || [],
      metrics: options.metrics || [],
      handoff_triggers: options.handoff_triggers || [],
      consent_class: options.consent_class || 'per_purpose',
      retention: options.retention || '7_years',
      data_sources_freshness: options.data_sources_freshness || 'daily',
      kill_switch: options.kill_switch || 'per_user',
      audit_surface: options.audit_surface || [],
      currency: options.currency || 'ZAR',
      language_scope: options.language_scope || ['en', 'zu', 'xh', 'af'],
      accessibility_scope: options.accessibility_scope || ['voice', 'text'],
      dependencies: options.dependencies || [],
      version: '1.0.0'
    });
  }
}

export class AgentFactory {
  constructor(db) {
    this.db = db;
    this.drafts = new Map();
    this.ruleBooks = new Map();
  }

  registerRuleBook(code, declaration) {
    this.ruleBooks.set(code, declaration);
  }

  getRuleBook(code) {
    return this.ruleBooks.get(code);
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
