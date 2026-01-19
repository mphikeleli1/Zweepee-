// mocks/groupCartApi.js
'use strict';

const logger = require('../logger');

/**
 * MOCK GROUP CART API
 * This is a mock in-memory database to simulate a real Group Cart service.
 */
const mockDatabase = {
  carts: [
    { id: 1, name: 'Weekly Groceries', type: 'group', inviteCode: 'SHOP', members: ['+1234567890'], items: [] }
  ],
  users: {},
};

let nextCartId = 2;

/**
 * Generates a random 4-character invite code.
 * @returns {string} The invite code.
 */
function generateInviteCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

/**
 * Mock function to create a new cart.
 * @param {string} ownerPhone - The phone number of the user creating the cart.
 * @param {string} name - The name of the cart.
 * @param {string} type - The type of the cart.
 * @returns {Promise<object>} The newly created cart object.
 */
async function createCart(ownerPhone, name, type) {
  logger.info(`MOCK API: Creating cart "${name}" for ${ownerPhone}`);
  const newCart = {
    id: nextCartId++,
    name,
    type,
    inviteCode: generateInviteCode(),
    members: [ownerPhone],
    items: [],
  };
  mockDatabase.carts.push(newCart);
  return Promise.resolve(newCart);
}

/**
 * Mock function to find a cart by its invite code.
 * @param {string} inviteCode - The invite code to search for.
 * @returns {Promise<object|null>} The cart object or null if not found.
 */
async function findCartByCode(inviteCode) {
  logger.info(`MOCK API: Searching for cart with code "${inviteCode}"`);
  const cart = mockDatabase.carts.find(c => c.inviteCode === inviteCode);
  return Promise.resolve(cart || null);
}

/**
 * Mock function to add an item to a cart.
 * @param {number} cartId - The ID of the cart.
 * @param {string} itemName - The name of the item.
 * @param {number} price - The price of the item.
 * @returns {Promise<void>}
 */
async function addItemToCart(cartId, itemName, price) {
  logger.info(`MOCK API: Adding "${itemName}" to cart ${cartId}`);
  const cart = mockDatabase.carts.find(c => c.id === cartId);
  if (cart) {
    cart.items.push({ name: itemName, price });
  }
  return Promise.resolve();
}

module.exports = {
  createCart,
  findCartByCode,
  addItemToCart,
};