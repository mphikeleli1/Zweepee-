// mocks/stokvelApi.js
'use strict';

const logger = require('../logger');

/**
 * MOCK STOKVEL API
 * This is a mock in-memory database to simulate a real Stokvel service.
 */
const mockDatabase = {
  stokvels: [
    { id: 1, name: 'Example Stokvel', type: 'rotation', inviteCode: 'JOINUS', members: ['+1234567890'] }
  ],
  users: {},
};

let nextStokvelId = 2;

/**
 * Generates a random 6-character invite code.
 * @returns {string} The invite code.
 */
function generateInviteCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

/**
 * Mock function to create a new stokvel.
 * @param {string} creatorPhone - The phone number of the user creating the stokvel.
 * @param {string} name - The name of the stokvel.
 * @param {string} type - The type of the stokvel ('rotation' or 'pooled').
 * @returns {Promise<object>} The newly created stokvel object.
 */
async function createStokvel(creatorPhone, name, type) {
  logger.info(`MOCK API: Creating stokvel "${name}" of type "${type}" for ${creatorPhone}`);
  const newStokvel = {
    id: nextStokvelId++,
    name,
    type,
    inviteCode: generateInviteCode(),
    members: [creatorPhone],
  };
  mockDatabase.stokvels.push(newStokvel);
  return Promise.resolve(newStokvel);
}

/**
 * Mock function to find a stokvel by its invite code.
 * @param {string} inviteCode - The invite code to search for.
 * @returns {Promise<object|null>} The stokvel object or null if not found.
 */
async function findStokvelByCode(inviteCode) {
  logger.info(`MOCK API: Searching for stokvel with code "${inviteCode}"`);
  const stokvel = mockDatabase.stokvels.find(s => s.inviteCode === inviteCode);
  return Promise.resolve(stokvel || null);
}

/**
 * Mock function to add a user to a stokvel.
 * @param {string} userPhone - The phone number of the user joining.
 * @param {number} stokvelId - The ID of the stokvel to join.
 * @returns {Promise<void>}
 */
async function joinStokvel(userPhone, stokvelId) {
  logger.info(`MOCK API: Adding user ${userPhone} to stokvel ${stokvelId}`);
  const stokvel = mockDatabase.stokvels.find(s => s.id === stokvelId);
  if (stokvel && !stokvel.members.includes(userPhone)) {
    stokvel.members.push(userPhone);
  }
  return Promise.resolve();
}

module.exports = {
  createStokvel,
  findStokvelByCode,
  joinStokvel,
};