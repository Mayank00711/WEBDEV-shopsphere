const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { verifyAccessToken } = require('../utils/tokens');

// authenticate: verifies "Authorization: Bearer <accessToken>" and loads req.user.
const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw ApiError.unauthorized('Access token missing');

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    throw ApiError.unauthorized(err.name === 'TokenExpiredError' ? 'Access token expired' : 'Invalid access token');
  }

  const user = await User.findById(payload.sub).select('+tokenVersion');
  if (!user || !user.isActive) throw ApiError.unauthorized('User no longer exists or is deactivated');
  // tokenVersion lets us invalidate every outstanding access token (logout-all / password change).
  if (user.tokenVersion !== payload.tv) throw ApiError.unauthorized('Access token has been revoked');

  req.user = user;
  next();
});

// authorize: role-based access control. Usage: authorize('admin', 'seller')
const authorize = (...roles) => (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!roles.includes(req.user.role)) {
    return next(ApiError.forbidden(`Role '${req.user.role}' is not allowed to access this resource`));
  }
  next();
};

module.exports = { authenticate, authorize };
