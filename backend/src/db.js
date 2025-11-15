// src/db.js
const mongoose = require("mongoose");
const { DEFAULTS } = require("./config");
const Job = require("./models/Job");

/**
 * Connect to MongoDB (singleton)
 */
let connected = false;
async function connect(uri) {
  uri = uri || DEFAULTS.mongo_uri;
  if (connected) return mongoose;
  await mongoose.connect(uri, { dbName: DEFAULTS.db_name });
  connected = true;
  return mongoose;
}

async function initDB(uri) {
  await connect(uri);
  // ensure indexes: claim by state + runAt + createdAt is efficient
  await Job.init();
  return mongoose;
}

module.exports = { connect, initDB, Job };
