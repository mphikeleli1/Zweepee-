// mirages/registry.js
'use strict';

// Import Mirage modules here
const insuranceMirage = require('./insurance');
const propertyMirage = require('./property');
const accommodationMirage = require('./accommodation');
const carRentalMirage = require('./carRental');
const stokvelMirage = require('./stokvel');
const groupCartMirage = require('./groupCart');
const safetyGuardianMirage = require('./safetyGuardian');
const travelMirage = require('./travel');
const mainMenuMirage = require('./mainMenu'); // Import MainMenuMirage
const config = require('../config');

// The registry is a map of all available mirages in the system.
const mirageRegistry = {
  // Main Menu is a special case, but we register it for consistency.
  MainMenuMirage: {
    name: 'MainMenuMirage',
    module: mainMenuMirage,
    keywords: ['menu', 'help', 'start', 'hello'],
    description: 'Displays the main menu.',
    launchType: 'text',
  },
  Insurance: {
    name: 'Insurance',
    module: insuranceMirage,
    keywords: ['insurance', 'cover', 'policy', 'santam', 'outsurance'],
    description: 'Compare quotes and buy insurance policies.',
    launchType: 'flow',
    flowId: config.insuranceFlowId,
    launchButtonText: 'Get a Quote',
  },
  Travel: {
    name: 'Travel',
    module: travelMirage,
    keywords: ['travel', 'flight', 'hotel', 'booking'],
    description: 'Book flights and hotels.',
    launchType: 'text',
  },
  Property: {
    name: 'Property',
    module: propertyMirage,
    keywords: ['property', 'bond', 'house', 'apartment', 'real estate'],
    description: 'Find properties and get pre-qualified for a bond.',
    launchType: 'text',
  },
  Accommodation: {
    name: 'Accommodation',
    module: accommodationMirage,
    keywords: ['stay', 'airbnb', 'rental', 'accommodation'],
    description: 'Book short-term rentals.',
    launchType: 'text',
  },
  CarRental: {
    name: 'Car Rental',
    module: carRentalMirage,
    keywords: ['car rental', 'rent a car', 'vehicle'],
    description: 'Rent a car from agencies or private owners.',
    launchType: 'text',
  },
  Stokvel: {
    name: 'Stokvel',
    module: stokvelMirage,
    keywords: ['stokvel', 'savings', 'club'],
    description: 'Create or join a digital savings club.',
    launchType: 'text',
  },
  GroupCart: {
    name: 'Group Cart',
    module: groupCartMirage,
    keywords: ['group cart', 'split', 'bulk buy'],
    description: 'Create or join a group shopping cart.',
    launchType: 'text',
  },
  SafetyGuardian: {
    name: 'Safety Guardian',
    module: safetyGuardianMirage,
    keywords: ['safety', 'emergency', 'guardian'],
    description: 'Opt-in emergency monitoring.',
    launchType: 'text',
  }
};

/**
 * Retrieves a mirage module by its name.
 * @param {string} mirageName - The name of the mirage (e.g., 'Insurance').
 * @returns {object|null} The mirage module or null if not found.
 */
function getMirage(mirageName) {
  const mirage = mirageRegistry[mirageName];
  return mirage ? mirage.module : null;
}

module.exports = {
  mirageRegistry,
  getMirage,
};