const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const tokens = require('../utils/tokens');

const MAX_SESSIONS = 5;

async function issueTokens(user) {
  const accessToken = tokens.signAccessToken(user);
  const refreshToken = tokens.signRefreshToken(user);
  const { exp } = tokens.verifyRefreshToken(refreshToken);

  // Keep the newest sessions only, and drop expired ones.
  const now = new Date();
  const kept = (user.refreshTokens || []).filter((t) => t.expiresAt > now).slice(-(MAX_SESSIONS - 1));
  kept.push({ tokenHash: tokens.hashToken(refreshToken), expiresAt: new Date(exp * 1000) });
  await User.updateOne({ _id: user._id }, { $set: { refreshTokens: kept } });

  return { accessToken, refreshToken, tokenType: 'Bearer' };
}

async function register(data) {
  const exists = await User.exists({ email: data.email });
  if (exists) throw ApiError.conflict('An account with this email already exists');
  const user = await User.create(data);
  const withTokens = await User.findById(user._id).select('+refreshTokens +tokenVersion');
  return { user, tokens: await issueTokens(withTokens) };
}

async function login(email, password) {
  const user = await User.findOne({ email }).select('+password +refreshTokens +tokenVersion');
  // Same message for unknown email and wrong password, so accounts cannot be enumerated.
  if (!user || !(await user.comparePassword(password))) throw ApiError.unauthorized('Invalid email or password');
  if (!user.isActive) throw ApiError.forbidden('This account has been deactivated');
  return { user, tokens: await issueTokens(user) };
}

// Refresh-token rotation: the presented token is consumed and a new pair issued.
// Re-using an already consumed token is treated as theft and revokes every session.
async function refresh(refreshToken) {
  let payload;
  try {
    payload = tokens.verifyRefreshToken(refreshToken);
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }
  const user = await User.findById(payload.sub).select('+refreshTokens +tokenVersion');
  if (!user || !user.isActive) throw ApiError.unauthorized('Invalid refresh token');

  const hash = tokens.hashToken(refreshToken);
  const match = user.refreshTokens.find((t) => t.tokenHash === hash);
  if (!match) {
    await User.updateOne({ _id: user._id }, { $set: { refreshTokens: [] }, $inc: { tokenVersion: 1 } });
    throw ApiError.unauthorized('Refresh token reuse detected; all sessions have been revoked');
  }
  user.refreshTokens = user.refreshTokens.filter((t) => t.tokenHash !== hash);
  return { user, tokens: await issueTokens(user) };
}

async function logout(userId, refreshToken, allDevices) {
  if (allDevices) {
    // Also bumps tokenVersion so outstanding access tokens stop working immediately.
    await User.updateOne({ _id: userId }, { $set: { refreshTokens: [] }, $inc: { tokenVersion: 1 } });
    return;
  }
  await User.updateOne({ _id: userId }, { $pull: { refreshTokens: { tokenHash: tokens.hashToken(refreshToken) } } });
}

async function changePassword(userId, currentPassword, newPassword) {
  const user = await User.findById(userId).select('+password +tokenVersion +refreshTokens');
  if (!(await user.comparePassword(currentPassword))) throw ApiError.unauthorized('Current password is incorrect');
  user.password = newPassword;
  user.tokenVersion += 1;
  user.refreshTokens = [];
  await user.save();
  return { user, tokens: await issueTokens(user) };
}

module.exports = { register, login, refresh, logout, changePassword };
