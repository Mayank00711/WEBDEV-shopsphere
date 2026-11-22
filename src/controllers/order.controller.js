const orderService = require('../services/order.service');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const { getPagination, buildMeta } = require('../utils/pagination');

exports.checkout = asyncHandler(async (req, res) => {
  const order = await orderService.checkout(req.user, req.body);
  created(res, order, 'Order placed successfully (payment is simulated)');
});

exports.list = asyncHandler(async (req, res) => {
  const p = getPagination(req.query);
  const { data, total } = await orderService.list(req.user, { ...p, ...req.query });
  ok(res, data, 'OK', buildMeta(total, p.page, p.limit));
});

exports.getById = asyncHandler(async (req, res) => ok(res, await orderService.getById(req.user, req.params.id)));

exports.updateStatus = asyncHandler(async (req, res) => {
  const order = await orderService.updateStatus(req.user, req.params.id, req.body.status, req.body.note);
  ok(res, order, `Order status changed to ${order.status}`);
});
