const ApiError = require('../utils/ApiError');

// validate({ body, query, params }) runs Joi schemas and replaces the input with the
// sanitized value (unknown keys stripped, types converted).
const validate = (schemas) => (req, _res, next) => {
  const details = [];
  for (const part of ['params', 'query', 'body']) {
    if (!schemas[part]) continue;
    const { error, value } = schemas[part].validate(req[part] ?? {}, {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });
    if (error) {
      details.push(...error.details.map((d) => ({ field: d.path.join('.'), location: part, message: d.message.replace(/"/g, '') })));
    } else if (part === 'query') {
      // req.query is a getter in Express 5-style setups; store separately to be safe.
      req.validatedQuery = value;
      Object.defineProperty(req, 'query', { value, writable: true, configurable: true });
    } else {
      req[part] = value;
    }
  }
  if (details.length) return next(ApiError.badRequest('Validation failed', details));
  next();
};

module.exports = validate;
