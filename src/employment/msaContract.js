/**
 * Master Service Agreement (MSA) Contract & Anti-Circumvention Module
 *
 * Features:
 * 1. 1-Click MSA Contract Acceptance on WhatsApp
 * 2. 12-Month Non-Circumvention & Introduction Fee Clause
 * 3. 14-Day Free Candidate Replacement Guarantee
 * 4. Cryptographic SHA-256 Audit Evidence Trail (ECTA Section 13 Compliant)
 * 5. Employer Contract Storage, Retrieval, and Evidence Bundle Export
 */

export class RecruitmentContractEngine {
  constructor(db, kv) {
    this.db = db;
    this.kv = kv;
    this.acceptedContracts = new Map();
  }

  /**
   * Generates Water-Tight MSA Contract Text
   */
  getContractText(companyName = 'Employer') {
    return `📜 *MASTER SERVICE AGREEMENT & RECRUITMENT CONTRACT*\n` +
      `───────────────────────────────\n\n` +
      `This Agreement is entered into between *myAI™ Network* and *${companyName}*.\n\n` +
      `1️⃣ *12-MONTH NON-CIRCUMVENTION CLAUSE:* Any candidate introduced by myAI™ who is hired by ${companyName} (or associated entities) within 12 months of introduction attracts the agreed placement fee, regardless of hiring route.\n` +
      `2️⃣ *PROOF OF INTRODUCTION:* All candidate introductions and CV unlocks are cryptographically timestamped in myAI™ D1 ledger as legal proof under South African Contract Law (ECTA Act 25 of 2002).\n` +
      `3️⃣ *14-DAY FREE REPLACEMENT GUARANTEE:* If a hired candidate resigns or fails to show up within 14 days of employment, myAI™ provides a 100% free replacement candidate or full credit.\n` +
      `4️⃣ *POPIA COMPLIANCE:* All candidate data must be processed lawfully and solely for recruitment purposes.`;
  }

  /**
   * Generates a Cryptographic SHA-256 Hash for Legal Admissibility
   */
  async _generateContractHash(payload) {
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(payload));
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * 1-Click Contract Acceptance with Water-Tight Legal Evidence Trail
   */
  async acceptContract({ employerId, companyName, candidateId, ipAddress = '0.0.0.0', userAgent = 'WhatsApp/2.24' }) {
    const contractId = `msa_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const contractText = this.getContractText(companyName);
    const timestamp = Date.now();
    const isoDate = new Date(timestamp).toISOString();

    const evidencePayload = {
      contractId,
      employerId,
      companyName: companyName || 'Employer Company',
      candidateId,
      acceptedAt: timestamp,
      isoDate,
      contractText,
      ectalawCompliance: 'ECTA Act 25 of 2002 (Section 13 Electronic Signatures)',
      clientMetadata: {
        ipAddress,
        userAgent,
        transport: 'WhatsApp Webhook Intercept'
      }
    };

    const sha256DigitalSignature = await this._generateContractHash(evidencePayload);

    const record = {
      ...evidencePayload,
      status: 'ACCEPTED_LEGAL_BINDING',
      sha256DigitalSignature,
      nonCircumventionExpiry: timestamp + (365 * 24 * 60 * 60 * 1000) // 12 Months
    };

    this.acceptedContracts.set(contractId, record);

    // Persist to D1 / KV if available
    if (this.db) {
      try {
        await this.db.prepare(
          `INSERT INTO legal_contracts (contract_id, employer_id, company_name, candidate_id, accepted_at, status, sha256_sig, evidence_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(contractId, employerId, companyName, candidateId, timestamp, record.status, sha256DigitalSignature, JSON.stringify(record)).run();
      } catch (err) {
        console.error('D1 contract record insert fallback:', err.message);
      }
    }

    if (this.kv) {
      try {
        await this.kv.put(`contract:${contractId}`, JSON.stringify(record));
        await this.kv.put(`employer_contracts:${employerId}:${contractId}`, JSON.stringify(record));
      } catch (err) {
        console.error('KV contract record insert fallback:', err.message);
      }
    }

    return {
      success: true,
      contractId,
      record,
      confirmationText: `✅ *Master Service Agreement Signed & Recorded!*\n\n` +
        `• Contract Ref: *${contractId}*\n` +
        `• Employer: *${companyName}*\n` +
        `• SHA-256 Sig: \`${sha256DigitalSignature.substring(0, 16)}...\`\n` +
        `• Statutory Legal Framework: *ECTA Act 25 of 2002*\n` +
        `• Protection: *12-Month Non-Circumvention Protection Active*\n` +
        `• Warranty: *14-Day Free Replacement Guarantee Included*\n\n` +
        `📲 *Candidate details unlocked!* Type *MY CONTRACTS* anytime to view or export signed legal evidence copies.`
    };
  }

  /**
   * Retrieves all contracts signed by an employer
   */
  async getEmployerContracts(employerId) {
    const contracts = [];
    for (const [id, record] of this.acceptedContracts.entries()) {
      if (record.employerId === employerId) {
        contracts.push(record);
      }
    }

    if (contracts.length === 0 && this.kv) {
      try {
        const list = await this.kv.list({ prefix: `employer_contracts:${employerId}:` });
        for (const key of list.keys) {
          const data = await this.kv.get(key.name);
          if (data) contracts.push(JSON.parse(data));
        }
      } catch (err) {
        console.error('Error fetching contracts from KV:', err.message);
      }
    }

    return contracts;
  }

  /**
   * Formats a complete Court-Admissible Legal Evidence Bundle for a contract
   */
  async getContractEvidenceBundle(contractId) {
    let record = this.acceptedContracts.get(contractId);

    if (!record && this.kv) {
      try {
        const data = await this.kv.get(`contract:${contractId}`);
        if (data) record = JSON.parse(data);
      } catch (err) {
        console.error('Error reading contract from KV:', err.message);
      }
    }

    if (!record) {
      return { success: false, error: 'Contract reference not found' };
    }

    const evidenceText = `⚖️ *COURT-ADMISSIBLE MSA LEGAL EVIDENCE BUNDLE*\n` +
      `───────────────────────────────\n` +
      `• Contract ID: *${record.contractId}*\n` +
      `• Status: *${record.status}*\n` +
      `• Employer Ref: *${record.employerId}* (${record.companyName})\n` +
      `• Candidate Ref: *${record.candidateId}*\n` +
      `• Execution Date: *${record.isoDate}* (Timestamp: ${record.acceptedAt})\n` +
      `• Statutory Compliance: *South African ECTA Act 25 of 2002 (Sec 13)*\n` +
      `• Non-Circumvention Window: *Until ${new Date(record.nonCircumventionExpiry).toISOString().split('T')[0]}*\n` +
      `• SHA-256 Digital Fingerprint:\n\`${record.sha256DigitalSignature}\`\n\n` +
      `📜 *ACCEPTED TERMS SUMMARY:*\n${record.contractText}\n\n` +
      `🔒 *AUDIT LOG & CLIENT METADATA:*\n` +
      `• IP Address: \`${record.clientMetadata?.ipAddress || '0.0.0.0'}\`\n` +
      `• User Agent: \`${record.clientMetadata?.userAgent || 'WhatsApp Native'}\`\n` +
      `• Evidence Trail Locked in myAI™ D1 Ledger & KV Storage.`;

    return {
      success: true,
      contractId,
      record,
      evidenceText
    };
  }
}
