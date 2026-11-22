// Loads .env once and exposes a typed, validated configuration object.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const required = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const isTest = process.env.NODE_ENV === 'test';

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isTest,
  port: Number(process.env.PORT) || 5000,
  mongoUri: isTest
    ? process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/shopsphere_test'
    : process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/shopsphere',
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  bcryptRounds: Number(process.env.BCRYPT_SALT_ROUNDS) || 10,
  corsOrigin: process.env.CORS_ORIGIN || '*',
};
