const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config/env');

function signAccessToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), role: user.role, tv: user.tokenVersion },
    config.jwt.accessSecret,
    { expiresIn: config.jwt.accessExpiresIn }
  );
}

function signRefreshToken(user) {
  // jti makes each refresh token unique so it can be individually revoked.
  return jwt.sign(
    { sub: user._id.toString(), jti: crypto.randomUUID() },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshExpiresIn }
  );
}

const verifyAccessToken = (token) => jwt.verify(token, config.jwt.accessSecret);
const verifyRefreshToken = (token) => jwt.verify(token, config.jwt.refreshSecret);

// Refresh tokens are stored hashed, so a database leak does not leak usable tokens.
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

module.exports = { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken, hashToken };
