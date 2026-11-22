const crypto = require('crypto');
const morgan = require('morgan');
const config = require('../config/env');

// Gives each request an id (returned as X-Request-Id) so log lines can be correlated.
function requestId(req, res, next) {
  req.id = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}

morgan.token('id', (req) => req.id);
morgan.token('user', (req) => (req.user ? `${req.user.role}:${req.user._id}` : 'anon'));

const httpLogger = morgan(':id :method :url :status :response-time ms - :user', {
  skip: () => config.isTest,
});

module.exports = { requestId, httpLogger };
