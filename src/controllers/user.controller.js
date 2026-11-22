const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const { getPagination, buildMeta } = require('../utils/pagination');

exports.getMe = asyncHandler(async (req, res) => ok(res, req.user));

exports.updateMe = asyncHandler(async (req, res) => {
  if (req.body.storeName && req.user.role !== 'seller') throw ApiError.badRequest('Only sellers have a store name');
  Object.assign(req.user, req.body);
  await req.user.save();
  ok(res, req.user, 'Profile updated');
});

exports.list = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (req.query.role) filter.role = req.query.role;
  if (req.query.isActive !== undefined) filter.isActive = req.query.isActive;
  if (req.query.search) {
    const rx = new RegExp(req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { email: rx }];
  }
  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);
  ok(res, users, 'OK', buildMeta(total, page, limit));
});

exports.getById = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');
  ok(res, user);
});

exports.create = asyncHandler(async (req, res) => {
  if (await User.exists({ email: req.body.email })) throw ApiError.conflict('An account with this email already exists');
  const user = await User.create(req.body);
  created(res, user, 'User created');
});

exports.update = asyncHandler(async (req, res) => {
  if (req.params.id === req.user._id.toString() && (req.body.role || req.body.isActive === false)) {
    throw ApiError.unprocessable('Admins cannot change their own role or deactivate themselves');
  }
  const user = await User.findById(req.params.id).select('+tokenVersion');
  if (!user) throw ApiError.notFound('User not found');
  const roleChanged = req.body.role && req.body.role !== user.role;
  Object.assign(user, req.body);
  // Changing role or deactivating invalidates the user's existing tokens.
  if (roleChanged || req.body.isActive === false) user.tokenVersion += 1;
  await user.save();
  ok(res, user, 'User updated');
});

exports.remove = asyncHandler(async (req, res) => {
  if (req.params.id === req.user._id.toString()) throw ApiError.unprocessable('Admins cannot delete themselves');
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) throw ApiError.notFound('User not found');
  ok(res, null, 'User deleted');
});
