const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');
const config = require('../config/env');

function notFound(req, _res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

// Centralized error handler: converts every kind of error into one JSON shape:
// { success: false, message, errors?, requestId }
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  let error = err;

  if (err instanceof mongoose.Error.ValidationError) {
    error = ApiError.badRequest(
      'Validation failed',
      Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }))
    );
  } else if (err instanceof mongoose.Error.CastError) {
    error = ApiError.badRequest(`Invalid value for ${err.path}: ${JSON.stringify(err.value)}`);
  } else if (err && err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    error = ApiError.conflict(`A record with this ${field} already exists`, [{ field, value: err.keyValue?.[field] }]);
  } else if (err && err.type === 'entity.parse.failed') {
    error = ApiError.badRequest('Malformed JSON in request body');
  } else if (!(err instanceof ApiError)) {
    if (!config.isTest) console.error(`[error] ${req.id}`, err);
    error = new ApiError(500, 'Internal server error');
  }

  const body = { success: false, message: error.message, requestId: req.id };
  if (error.details) body.errors = error.details;
  if (error.statusCode === 500 && config.nodeEnv === 'development') body.stack = err.stack;
  res.status(error.statusCode).json(body);
}

module.exports = { notFound, errorHandler };
