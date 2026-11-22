const Notification = require('../models/Notification');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const { getPagination, buildMeta } = require('../utils/pagination');

exports.list = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query, 20);
  const filter = { user: req.user._id };
  if (req.query.unread === 'true') filter.read = false;
  const [items, total, unread] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Notification.countDocuments(filter),
    Notification.countDocuments({ user: req.user._id, read: false }),
  ]);
  ok(res, items, 'OK', { ...buildMeta(total, page, limit), unread });
});

exports.markRead = asyncHandler(async (req, res) => {
  const n = await Notification.findOneAndUpdate({ _id: req.params.id, user: req.user._id }, { read: true }, { new: true });
  if (!n) throw ApiError.notFound('Notification not found');
  ok(res, n);
});

exports.markAllRead = asyncHandler(async (req, res) => {
  const r = await Notification.updateMany({ user: req.user._id, read: false }, { read: true });
  ok(res, { updated: r.modifiedCount }, 'All notifications marked as read');
});
