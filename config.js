// config.js
'use strict';

// Load environment variables from a .env file
require('dotenv').config();
const logger = require('./logger');

const config = {
  port: process.env.PORT || 3000,
  redisUrl: process.env.REDIS_URL,
  meta: {
    apiVersion: process.env.META_API_VERSION || 'v20.0',
    accessToken: process.env.META_ACCESS_TOKEN,
    appSecret: process.env.META_APP_SECRET,
    phoneNumberId: process.env.META_PHONE_NUMBER_ID,
    verifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN,
  },
  // Add other configurations as needed
};

// --- Validation ---
// Ensure critical variables are defined
if (!config.redisUrl) {
  logger.error('FATAL ERROR: REDIS_URL environment variable is not set.');
  process.exit(1);
}
if (!config.meta.accessToken) {
  logger.error('FATAL ERROR: META_ACCESS_TOKEN environment variable is not set.');
  process.exit(1);
}
if (!config.meta.appSecret) {
  logger.error('FATAL ERROR: META_APP_SECRET environment variable is not set.');
  process.exit(1);
}
if (!config.meta.phoneNumberId) {
    logger.error('FATAL ERROR: META_PHONE_NUMBER_ID environment variable is not set.');
    process.exit(1);
}
if (!config.meta.verifyToken) {
    logger.error('FATAL ERROR: META_WEBHOOK_VERIFY_TOKEN environment variable is not set.');
    process.exit(1);
}


module.exports = config;