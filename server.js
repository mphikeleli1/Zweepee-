// server.js
'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const logger = require('./logger');
const sessionManager = require('./session/manager');
const { getMirage } = require('./mirages/registry');
const whatsappClient = require('./whatsapp/client');
const config = require('./config');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
});
app.use(limiter);

app.use(bodyParser.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

// --- Webhook Verification Middleware ---
function verifyWebhookSignature(req, res, next) {
  const signature = req.headers['x-hub-signature-256'];
  if (!signature) {
    logger.warn('Missing X-Hub-Signature-256 header');
    return res.status(401).send('Unauthorized');
  }

  const hash = crypto
    .createHmac('sha256', config.meta.appSecret)
    .update(req.rawBody)
    .digest('hex');

  if (signature !== `sha256=${hash}`) {
    logger.warn('Invalid signature');
    return res.status(401).send('Unauthorized');
  }

  next();
}

// --- Main Message Handling Logic ---
async function handleMessage(message) {
  // Detailed logging for debugging
  logger.info('handleMessage received:', { message });

  // Basic validation to prevent crashes on malformed messages
  if (!message || !message.from || !message.text || !message.text.body) {
    logger.error('Malformed message object received:', { message });
    return;
  }

  const { from: phone, text } = message;
  logger.info(`Processing message from ${phone}: "${text.body}"`);

  try {
    let session = await sessionManager.getSession(phone);

    // If no session exists, create a new one
    if (!session) {
      logger.info(`No session found for ${phone}. Creating a new one.`);
      session = await sessionManager.createSession(phone);
    }

    // Determine which mirage should handle the message
    const currentMirageName = session.currentMirage || 'MainMenuMirage';
    const mirage = getMirage(currentMirageName);

    if (mirage) {
      await mirage.handle(session, message);
    } else {
      logger.error(`Mirage not found: ${currentMirageName}. Resetting to Main Menu.`);
      await sessionManager.updateSession(phone, { currentMirage: null, mirageState: {} });
      const mainMenu = getMirage('MainMenuMirage');
      await mainMenu.handle(session, message);
    }
  } catch (error) {
    logger.error('Error in handleMessage:', { error: error.stack });
    if (message.from) {
      await whatsappClient.sendTextMessage(message.from, "Sorry, a critical error occurred. Please try again later.");
    }
  }
}


// --- Express Routes ---

app.get('/', (req, res) => {
  res.send('Zweepee server is running ✅');
});

// WhatsApp webhook verification
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token && token === config.meta.verifyToken) {
    logger.info('Webhook verified successfully!');
    res.status(200).send(challenge);
  } else {
    logger.error('Webhook verification failed.');
    res.sendStatus(403);
  }
});

// WhatsApp webhook endpoint for incoming messages
app.post('/webhook', verifyWebhookSignature, (req, res) => {
  logger.info('--- Incoming WhatsApp Webhook ---');
  logger.debug('Webhook body:', { body: req.body });

  const { object, entry } = req.body;

  if (object === 'whatsapp_business_account' && entry) {
    entry.forEach(entryItem => {
      if (entryItem.changes) {
        entryItem.changes.forEach(change => {
          if (change.field === 'messages' && change.value && change.value.messages) {
            change.value.messages.forEach(handleMessage);
          }
        });
      }
    });
  }

  res.sendStatus(200);
});

// --- Server Startup ---
const PORT = config.port || 3000;
app.listen(PORT, () => {
  logger.info(`Server listening on port ${PORT}`);
});