import { calculateFare, findBestInsertion, selectDriver } from './server.js';
import assert from 'assert';

console.log("--- Running Revamp Logic Tests ---");

// Test calculateFare
console.log("Testing calculateFare...");
const fare1 = calculateFare('shared_sedan', 10);
assert.strictEqual(fare1.fare, 35, "Shared Short should be R35");
assert.strictEqual(fare1.platform_fee, 5, "Shared Fee should be R5");

const fare2 = calculateFare('solo_sedan', 20);
assert.strictEqual(fare2.fare, 139, "Solo Medium should be R139");

const fare3 = calculateFare('moto_ride', 25);
assert.strictEqual(fare3.fare, 45, "Moto Long should be R45");

const fare4 = calculateFare('moto_courier', 10);
assert.strictEqual(fare4.fare, 70, "Courier 10km should be R70 (20 + 10*5)");

console.log("✅ calculateFare Tests Passed");

// Test selectDriver
console.log("Testing selectDriver...");
const drivers = [
    { id: 1, location: { lat: -26.1, lng: 28.1 }, rating: 4.8, acceptanceRate: 0.9, tripsToday: 10 },
    { id: 2, location: { lat: -26.2, lng: 28.2 }, rating: 4.9, acceptanceRate: 0.95, tripsToday: 2 }
];
const pickup = { lat: -26.19, lng: 28.19 };
const chosen = selectDriver(drivers, pickup, 5);
assert.strictEqual(chosen.id, 2, "Should choose driver 2 due to fairness (fewer trips) and proximity balance");
console.log("✅ selectDriver Tests Passed");

console.log("--- All Revamp Logic Tests Passed! ---");
