const admin = require("firebase-admin");
const path = require("path");

function loadServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (raw && raw.trim()) {
    return JSON.parse(raw);
  }
  return require(path.join(__dirname, "secrets", "firebase-service-account.json"));
}

admin.initializeApp({
  credential: admin.credential.cert(loadServiceAccount()),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.database();

module.exports = { db };