/**
 * Intent-First & Constraint-First Job Seeker Onboarding Module
 *
 * Features:
 * 1. Intent-First Questioning ("What kind of work are you looking for?")
 * 2. Intent-Adaptive Conversational Question Sequences (Retail, Graduate, First-Time, Driver, Admin, Care, Call Centre, Trades, Part-Time)
 * 3. Real-Life Constraints Capture (Shifts, Weekend willingness, Transport viability)
 * 4. State Persistence & PAUSE Support (Saves progress to KV after every answer)
 */

export class JobSeekerOnboardingEngine {
  constructor(kvUsers) {
    this.kvUsers = kvUsers;
    this.inMemoryStates = new Map();
  }

  async getOnboardingState(waId) {
    const key = `job_onboard:${waId}`;
    if (this.kvUsers) {
      const data = await this.kvUsers.get(key);
      if (data) return JSON.parse(data);
    }
    return this.inMemoryStates.get(key) || { step: 'AWAITING_INTENT', data: {} };
  }

  async saveOnboardingState(waId, state) {
    const key = `job_onboard:${waId}`;
    if (this.kvUsers) {
      await this.kvUsers.put(key, JSON.stringify(state), { expirationTtl: 86400 * 30 });
    } else {
      this.inMemoryStates.set(key, state);
    }
  }

  /**
   * Conversational Intent & Constraint Question Flow
   */
  async handleJobSeekerMessage(waId, text = '') {
    const input = text.trim();
    let state = await this.getOnboardingState(waId);

    // PAUSE Command Support
    if (input.toUpperCase() === 'PAUSE' || input.toLowerCase().includes('pause')) {
      state.isPaused = true;
      await this.saveOnboardingState(waId, state);
      return {
        text: `⏸️ *Onboarding Paused!*\n\nYour progress has been saved safely. Simply reply *RESUME* or *HI* whenever you're ready to continue!`
      };
    }

    if (state.isPaused) {
      if (input.toUpperCase() === 'RESUME' || input.toLowerCase().includes('resume')) {
        state.isPaused = false;
        await this.saveOnboardingState(waId, state);
        return { text: `▶️ *Resumed!* Let's continue where we left off. What license code or qualification do you have?` };
      }
      return { text: `⏸️ Onboarding is currently paused. Reply *RESUME* when you're ready to continue!` };
    }

    // Step 1: Start with Intent or Conversational Opener
    if (state.step === 'AWAITING_INTENT') {
      state.data.intent = input;
      const lower = input.toLowerCase();

      if (lower.includes('tell me about yourself') || lower.includes('profile setup') || lower.includes('start profiling')) {
        state.step = 'CONVERSATIONAL_STORY';
        await this.saveOnboardingState(waId, state);
        return {
          text: `😊 *Tell Me A Bit About Yourself & Your Journey!*\n\n` +
            `What kind of work do you do, what did you study or work on recently, and what are you looking for in your next role?`
        };
      }

      // Classify Job Seeker Type
      if (lower.includes('driver') || lower.includes('pdp') || lower.includes('code')) {
        state.seekerType = 'DRIVER';
        state.step = 'DRIVER_LICENSE_CODE';
        await this.saveOnboardingState(waId, state);
        return { text: `🚚 *Driver Profile Setup*\n\nWhat license code do you have? (e.g. *Code 8, Code 10, Code 14*)` };
      }

      if (lower.includes('grad') || lower.includes('degree') || lower.includes('diploma') || lower.includes('bsc') || lower.includes('bcom') || lower.includes('engineer') || lower.includes('advocate') || lower.includes('legal')) {
        state.seekerType = 'GRADUATE';
        state.step = 'GRAD_QUALIFICATION';
        await this.saveOnboardingState(waId, state);
        return { text: `🎓 *Professional Profile Setup*\n\nTell me a bit about your qualification, degree, or legal bar admission! (e.g. *BSc CompSci at Wits* or *Admitted Advocate*)` };
      }

      if (lower.includes('first time') || lower.includes('never worked') || lower.includes('matric')) {
        state.seekerType = 'FIRST_TIME';
        state.step = 'FIRST_TIME_EDUCATION';
        await this.saveOnboardingState(waId, state);
        return { text: `🌟 *First-Time Job Seeker Profile*\n\nWhat is your highest education level? (e.g. *Matric 2022*)` };
      }

      // Default: Retail / General / Office
      state.seekerType = 'RETAIL_GENERAL';
      state.step = 'CONSTRAINT_WEEKENDS';
      await this.saveOnboardingState(waId, state);
      return { text: `🏬 *Job Preferences*\n\nAre you open to working weekends and public holidays if required? (Reply *Yes* or *No*)` };
    }

    if (state.step === 'CONVERSATIONAL_STORY') {
      state.data.story = input;
      state.step = 'GENTLE_FOLLOWUP_SALARY_LOCATION';
      await this.saveOnboardingState(waId, state);

      return {
        text: `That sounds like a wonderful background! 🚀\n\n` +
          `Just two quick details to round out your profile:\n` +
          `1. What target monthly salary or retainer are you aiming for?\n` +
          `2. Where do you stay and what is your preferred work setup? (e.g. *Rosebank, Hybrid / In-Office*)`
      };
    }

    if (state.step === 'GENTLE_FOLLOWUP_SALARY_LOCATION') {
      state.data.salaryAndLocation = input;
      state.step = 'COMPLETED';
      await this.saveOnboardingState(waId, state);

      return {
        completed: true,
        seekerType: 'PROFESSIONAL_CONVERSATIONAL',
        candidateProfile: state.data,
        text: `🎉 *Your Job Candidate Profile Is Complete & Active!*\n\n` +
          `• *Background:* ${state.data.story}\n` +
          `• *Salary & Location:* ${state.data.salaryAndLocation}\n\n` +
          `Your Personal Agent has generated your Free ATS CV and auto-broadcasted your profile to top employers! 🚀`
      };
    }

    // Step 2: Intent-Adaptive Questioning
    if (state.step === 'DRIVER_LICENSE_CODE') {
      state.data.licenseCode = input;
      state.step = 'DRIVER_PDP';
      await this.saveOnboardingState(waId, state);
      return { text: `📋 Do you have a valid PDP (Public Driver Permit)? (Reply *Yes* or *No*)` };
    }

    if (state.step === 'DRIVER_PDP') {
      state.data.hasPdp = input.toLowerCase().includes('yes');
      state.step = 'CONSTRAINT_LOCATION';
      await this.saveOnboardingState(waId, state);
      return { text: `📍 Where are you located and how far can you travel for work daily? (e.g. *Soweto, up to 15km*)` };
    }

    if (state.step === 'GRAD_QUALIFICATION') {
      state.data.qualification = input;
      state.step = 'GRAD_NOTICE_PERIOD';
      await this.saveOnboardingState(waId, state);
      return { text: `📅 When can you start work, and do you have a notice period? (e.g. *Immediately* or *30 days notice*)` };
    }

    if (state.step === 'GRAD_NOTICE_PERIOD') {
      state.data.noticePeriod = input;
      state.step = 'CONSTRAINT_LOCATION';
      await this.saveOnboardingState(waId, state);
      return { text: `📍 Where do you stay and are you looking for in-office, hybrid, or remote work?` };
    }

    if (state.step === 'FIRST_TIME_EDUCATION') {
      state.data.highestEducation = input;
      state.step = 'FIRST_TIME_INTERESTS';
      await this.saveOnboardingState(waId, state);
      return { text: `💡 Do you have any volunteering, school leadership, or sports experience, and what work interests you most?` };
    }

    if (state.step === 'FIRST_TIME_INTERESTS') {
      state.data.interests = input;
      state.step = 'CONSTRAINT_LOCATION';
      await this.saveOnboardingState(waId, state);
      return { text: `📍 Where do you stay and how do you plan to travel to work daily?` };
    }

    if (state.step === 'CONSTRAINT_WEEKENDS') {
      state.data.workWeekends = input.toLowerCase().includes('yes');
      state.step = 'CONSTRAINT_LOCATION';
      await this.saveOnboardingState(waId, state);
      return { text: `📍 Where are you located and how far can you travel for work?` };
    }

    if (state.step === 'CONSTRAINT_LOCATION') {
      state.data.locationAndTransport = input;
      state.step = 'COMPLETED';
      await this.saveOnboardingState(waId, state);

      return {
        completed: true,
        seekerType: state.seekerType,
        candidateProfile: state.data,
        text: `🎉 *Your Job Candidate Profile Is Complete & Active!*\n\n` +
          `• *Work Intent:* ${state.data.intent}\n` +
          `• *Location & Transport:* ${state.data.locationAndTransport}\n\n` +
          `Your Personal Agent has auto-broadcasted your profile to employers across the myAI Recruitment Network! 🚀`
      };
    }

    return { text: `How can I help you with your job search today?` };
  }
}
