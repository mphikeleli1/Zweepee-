// session/manager.js
'use strict';

const { createClient } = require('redis');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');

/**
 * The Session Manager handles user state and conversation context using Redis.
 */
class SessionManager {
  constructor() {
    if (!config.redisUrl) {
      throw new Error('Redis URL is required for SessionManager.');
    }
    this.redisClient = createClient({ url: config.redisUrl });
    this.redisClient.on('error', (err) => console.error('Redis Client Error', err));
    this.redisClient.connect();
    this.sessionTimeout = 24 * 60 * 60; // 24 hours
  }

  /**
   * Creates a new session for a user.
   * @param {string} phone - The user's phone number.
   * @returns {object} The new session object.
   */
  async createSession(phone) {
    const sessionId = uuidv4();
    const sessionKey = `session:${phone}`;
    const sessionData = {
      sessionId,
      phone,
      createdAt: new Date().toISOString(),
      currentMirage: null,
      mirageState: {},
      history: [],
    };
    await this.redisClient.set(sessionKey, JSON.stringify(sessionData), {
      EX: this.sessionTimeout,
    });
    return sessionData;
  }

  /**
   * Retrieves a user's session from Redis.
   * @param {string} phone - The user's phone number.
   * @returns {object|null} The session object or null if not found.
   */
  async getSession(phone) {
    const sessionKey = `session:${phone}`;
    const sessionData = await this.redisClient.get(sessionKey);
    return sessionData ? JSON.parse(sessionData) : null;
  }

  /**
   * Updates a user's session data in Redis.
   * @param {string} phone - The user's phone number.
   * @param {object} updates - An object containing the session fields to update.
   * @returns {object} The updated session object.
   */
  async updateSession(phone, updates) {
    const sessionKey = `session:${phone}`;
    let sessionData = await this.getSession(phone);
    if (!sessionData) {
      sessionData = await this.createSession(phone);
    }
    const updatedSession = { ...sessionData, ...updates, updatedAt: new Date().toISOString() };
    await this.redisClient.set(sessionKey, JSON.stringify(updatedSession), {
      EX: this.sessionTimeout,
    });
    return updatedSession;
  }

  /**
   * Ends a user's session.
   * @param {string} phone - The user's phone number.
   */
  async endSession(phone) {
    const sessionKey = `session:${phone}`;
    await this.redisClient.del(sessionKey);
  }
}

module.exports = new SessionManager();