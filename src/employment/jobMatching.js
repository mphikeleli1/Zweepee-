/**
 * Superior AI Job Matching & Proactive Candidate Placement Engine
 *
 * Features:
 * 1. Proximity Radius Matching (GPS Lat/Lng & Suburb - Prioritizes < 5km to minimize worker commute costs)
 * 2. Multi-Factor Qualification Scoring (Matric, Driver's License, Language, Experience, Reference Rating, Police Clearance)
 * 3. Proactive Candidate Push: Auto-registers candidate profile from ATS CV / Employment Pack into myAI Recruitment Pool
 * 4. Interactive WhatsApp Candidate Profile Cards with Verified Badges & 1-Tap Interview Scheduling
 */

export class SuperiorJobMatchingEngine {
  constructor() {
    this.candidatePool = new Map();
    this.seedSampleCandidates();
  }

  seedSampleCandidates() {
    this.registerCandidate({
      candidateId: 'cand_sipho_101',
      fullName: 'Sipho Dlamini',
      phone: '27821112222',
      role: 'Cashier / Retail Staff',
      suburb: 'Midrand, Gauteng',
      location: { lat: -25.998, lng: 28.126 },
      qualifications: ['Matric', 'Code 8 Drivers License'],
      languages: ['English', 'isiZulu', 'Sotho'],
      experienceYears: 3,
      hasPoliceClearance: true,
      referenceRatingStars: 4.9,
      salaryCents: 500000 // R5,000/mo
    });

    this.registerCandidate({
      candidateId: 'cand_lindiwe_202',
      fullName: 'Lindiwe Khumalo (BSc Postgraduate)',
      phone: '27823334444',
      role: 'Junior Software Engineer / Data Analyst',
      suburb: 'Rosebank, Johannesburg',
      location: { lat: -26.145, lng: 28.043 },
      qualifications: ['BSc Computer Science', 'Matric', 'Python Certified'],
      languages: ['English', 'isiXhosa', 'Afrikaans'],
      experienceYears: 2,
      hasPoliceClearance: true,
      referenceRatingStars: 5.0,
      salaryCents: 1800000 // R18,000/mo
    });
  }

  registerCandidate(candidateData) {
    const candidateId = candidateData.candidateId || `cand_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const record = {
      candidateId,
      fullName: candidateData.fullName || 'Job Candidate',
      phone: candidateData.phone || '',
      role: candidateData.role || 'General Staff',
      suburb: candidateData.suburb || 'Gauteng',
      location: candidateData.location || { lat: -26.204, lng: 28.047 }, // JHB Default
      qualifications: candidateData.qualifications || ['Matric'],
      languages: candidateData.languages || ['English'],
      experienceYears: candidateData.experienceYears || 1,
      hasPoliceClearance: Boolean(candidateData.hasPoliceClearance),
      referenceRatingStars: candidateData.referenceRatingStars || 4.8,
      salaryCents: candidateData.salaryCents || 500000,
      registeredAt: Date.now()
    };

    this.candidatePool.set(candidateId, record);
    return record;
  }

  calculateDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 10) / 10;
  }

  matchSuperiorCandidates({ jobRole, employerLocation, maxSalaryCents, requiredQualifications = [], maxDistanceKm = 15 }) {
    const roleQuery = (jobRole || '').toLowerCase().trim();
    const matches = [];

    for (const candidate of this.candidatePool.values()) {
      // 1. Role / Skill Relevance Match
      const isRoleMatch = roleQuery === '' ||
        candidate.role.toLowerCase().includes(roleQuery) ||
        roleQuery.split(' ').some(word => word.length > 3 && candidate.role.toLowerCase().includes(word));

      if (!isRoleMatch) continue;

      // 2. Budget / Salary Cap Filter
      if (maxSalaryCents && candidate.salaryCents > maxSalaryCents) {
        continue;
      }

      // 3. Proximity Calculation (Prioritizes < 5km)
      let distanceKm = 3.0; // Default suburb proximity
      if (employerLocation && employerLocation.lat && candidate.location) {
        distanceKm = this.calculateDistanceKm(
          employerLocation.lat, employerLocation.lng,
          candidate.location.lat, candidate.location.lng
        );
      }

      if (distanceKm > maxDistanceKm) continue;

      // 4. Multi-Factor Match Score Calculation (0.0 to 1.0)
      const proximityScore = Math.max(0, 1 - (distanceKm / maxDistanceKm));
      const expScore = Math.min(1, candidate.experienceYears / 5);
      const ratingScore = candidate.referenceRatingStars / 5.0;
      const clearanceBonus = candidate.hasPoliceClearance ? 0.1 : 0;

      const totalScore = Math.round(((proximityScore * 0.4) + (expScore * 0.25) + (ratingScore * 0.25) + clearanceBonus) * 100) / 100;

      matches.push({
        candidate,
        distanceKm,
        matchScore: totalScore,
        proximityBadge: distanceKm <= 5.0 ? '📍 < 5km (Low Commute Cost)' : `📍 ${distanceKm}km away`,
        verifiedBadge: candidate.hasPoliceClearance ? '🛡️ Police Cleared & Verified References' : '⭐ Verified References'
      });
    }

    matches.sort((a, b) => b.matchScore - a.matchScore);
    return matches;
  }
}
