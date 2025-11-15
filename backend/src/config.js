// src/config.js
module.exports = {
  DEFAULTS: {
    max_retries: 3,
    backoff_base: 2,          // delay = base ** attempts (seconds)
    backoff_cap: 3600,        // maximum delay in seconds
    mongo_uri: process.env.MONGO_URI || "mongodb://localhost:27017/queuectl",
    db_name: "queuectl"
  }
};
