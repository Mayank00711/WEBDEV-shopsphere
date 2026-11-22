const Coupon = require('../models/Coupon');
const couponService = require('../services/coupon.service');
const cartService = require('../services/cart.service');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');

exports.list = asyncHandler(async (_req, res) => ok(res, await Coupon.find().sort({ createdAt: -1 })));
exports.create = asyncHandler(async (req, res) => created(res, await Coupon.create(req.body), 'Coupon created'));
exports.update = asyncHandler(async (req, res) => {
  const c = await Coupon.findById(req.params.id);
  if (!c) throw ApiError.notFound('Coupon not found');
  Object.assign(c, req.body);
  await c.save();
  ok(res, c, 'Coupon updated');
});
exports.remove = asyncHandler(async (req, res) => {
  const c = await Coupon.findByIdAndDelete(req.params.id);
  if (!c) throw ApiError.notFound('Coupon not found');
  ok(res, null, 'Coupon deleted');
});

// Customer preview: what discount would this code give on my current cart?
exports.apply = asyncHandler(async (req, res) => {
  const cart = await cartService.priceCart(await cartService.getOrCreate(req.user._id));
  const { coupon, discount } = await couponService.evaluate(req.body.code, cart.subtotal);
  ok(res, { code: coupon.code, type: coupon.type, value: coupon.value, discount, subtotal: cart.subtotal, totalAfterDiscount: couponService.round2(cart.total - discount) }, 'Coupon is valid');
});
