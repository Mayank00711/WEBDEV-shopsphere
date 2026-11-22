const cartService = require('../services/cart.service');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');

exports.get = asyncHandler(async (req, res) => {
  const cart = await cartService.getOrCreate(req.user._id);
  ok(res, await cartService.priceCart(cart));
});
exports.addItem = asyncHandler(async (req, res) =>
  ok(res, await cartService.addItem(req.user._id, req.body.productId, req.body.quantity), 'Item added to cart'));
exports.updateItem = asyncHandler(async (req, res) =>
  ok(res, await cartService.updateItem(req.user._id, req.params.productId, req.body.quantity), 'Cart updated'));
exports.removeItem = asyncHandler(async (req, res) =>
  ok(res, await cartService.removeItem(req.user._id, req.params.productId), 'Item removed'));
exports.clear = asyncHandler(async (req, res) => ok(res, await cartService.clear(req.user._id), 'Cart cleared'));
