const authService = require('../services/auth.service');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');

exports.register = asyncHandler(async (req, res) => {
  const { user, tokens } = await authService.register(req.body);
  created(res, { user, ...tokens }, 'Registration successful');
});

exports.login = asyncHandler(async (req, res) => {
  const { user, tokens } = await authService.login(req.body.email, req.body.password);
  ok(res, { user, ...tokens }, 'Login successful');
});

exports.refresh = asyncHandler(async (req, res) => {
  const { tokens } = await authService.refresh(req.body.refreshToken);
  ok(res, tokens, 'Token refreshed');
});

exports.logout = asyncHandler(async (req, res) => {
  await authService.logout(req.user._id, req.body.refreshToken, req.body.allDevices);
  ok(res, null, req.body.allDevices ? 'Logged out from all devices' : 'Logged out');
});

exports.changePassword = asyncHandler(async (req, res) => {
  const { tokens } = await authService.changePassword(req.user._id, req.body.currentPassword, req.body.newPassword);
  ok(res, tokens, 'Password changed; other sessions have been signed out');
});
