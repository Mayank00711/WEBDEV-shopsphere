const crypto = require('crypto');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Cart = require('../models/Cart');
const ApiError = require('../utils/ApiError');
const inventory = require('./inventory.service');
const coupons = require('./coupon.service');
const { FREE_SHIPPING_OVER, SHIPPING_FEE } = require('./cart.service');
const { eventBus, EVENTS } = require('../events/eventBus');
const { STATUS_TRANSITIONS } = Order;
const { round2 } = coupons;

// Simulated payment gateway. No real card or bank data is ever handled.
function simulatePayment(method, amount, forceFail) {
  if (forceFail) throw new ApiError(402, 'Simulated payment was declined. No money was charged.');
  if (method === 'COD') return { method, status: 'pending', simulated: true };
  return {
    method,
    status: 'paid',
    simulated: true,
    transactionId: `SIM-${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
    paidAt: new Date(),
    amount,
  };
}

async function checkout(user, { shippingAddress, paymentMethod, couponCode, simulatePaymentFailure }) {
  const cart = await Cart.findOne({ user: user._id });
  if (!cart || cart.items.length === 0) throw ApiError.unprocessable('Your cart is empty');

  // 1. Re-validate every product and take a price snapshot from the database.
  const products = await Product.find({ _id: { $in: cart.items.map((i) => i.product) } });
  const byId = new Map(products.map((p) => [p._id.toString(), p]));
  const items = cart.items.map((ci) => {
    const p = byId.get(ci.product.toString());
    if (!p || !p.isActive) throw ApiError.unprocessable('A product in your cart is no longer available', [{ product: ci.product }]);
    if (p.stock < ci.quantity) {
      throw ApiError.conflict(`Insufficient stock for "${p.name}"`, [{ product: p._id, requested: ci.quantity, available: p.stock }]);
    }
    return { product: p._id, seller: p.seller, name: p.name, unitPrice: p.price, quantity: ci.quantity, lineTotal: round2(p.price * ci.quantity) };
  });

  // 2. Server-side totals.
  const subtotal = round2(items.reduce((s, i) => s + i.lineTotal, 0));
  let discount = 0;
  let coupon = null;
  if (couponCode) ({ coupon, discount } = await coupons.evaluate(couponCode, subtotal));
  const shippingFee = subtotal >= FREE_SHIPPING_OVER ? 0 : SHIPPING_FEE;
  const total = round2(subtotal - discount + shippingFee);

  // 3. Payment (simulated) before touching stock.
  const payment = simulatePayment(paymentMethod, total, simulatePaymentFailure);

  // 4. Atomic stock reservation (all-or-nothing).
  const orderId = new mongoose.Types.ObjectId();
  const reserved = await inventory.reserveItems(items, { order: orderId, by: user._id });

  try {
    if (coupon) await coupons.consume(coupon);
    const order = await Order.create({
      _id: orderId,
      customer: user._id,
      items,
      subtotal,
      discount,
      couponCode: coupon ? coupon.code : undefined,
      shippingFee,
      total,
      shippingAddress,
      payment,
      status: 'pending',
      statusHistory: [{ status: 'pending', changedBy: user._id, note: 'Order placed' }],
    });
    cart.items = [];
    await cart.save();
    eventBus.emit(EVENTS.ORDER_PLACED, { order });
    return order;
  } catch (err) {
    await inventory.releaseReservation(reserved); // compensate on failure
    throw err;
  }
}

function canView(user, order) {
  if (user.role === 'admin') return true;
  if (user.role === 'customer') return order.customer.toString() === user._id.toString();
  if (user.role === 'seller') return order.items.some((i) => i.seller.toString() === user._id.toString());
  return false;
}

async function getById(user, id) {
  const order = await Order.findById(id).populate('customer', 'name email').populate('items.product', 'name images');
  if (!order) throw ApiError.notFound('Order not found');
  // Return 404 rather than 403 so order ids of other customers cannot be probed.
  const raw = { customer: order.customer._id, items: order.items.map((i) => ({ seller: i.seller })) };
  if (!canView(user, raw)) throw ApiError.notFound('Order not found');
  return order;
}

function scopeFilter(user) {
  if (user.role === 'customer') return { customer: user._id };
  if (user.role === 'seller') return { 'items.seller': user._id };
  return {};
}

async function list(user, { page, limit, skip, status, from, to }) {
  const filter = scopeFilter(user);
  if (status) filter.status = status;
  if (from || to) filter.createdAt = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
  const [data, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('customer', 'name email'),
    Order.countDocuments(filter),
  ]);
  return { data, total, page, limit };
}

async function updateStatus(user, id, to, note) {
  const order = await Order.findById(id);
  if (!order) throw ApiError.notFound('Order not found');
  const uid = user._id.toString();

  if (user.role === 'customer') {
    if (order.customer.toString() !== uid) throw ApiError.notFound('Order not found');
    if (to !== 'cancelled') throw ApiError.forbidden('Customers can only cancel their orders');
  } else if (user.role === 'seller') {
    const mine = order.items.filter((i) => i.seller.toString() === uid).length;
    if (mine === 0) throw ApiError.notFound('Order not found');
    if (mine !== order.items.length) throw ApiError.forbidden('This order contains items from other sellers; an admin must update it');
  }

  const from = order.status;
  if (from === to) throw ApiError.conflict(`Order is already ${to}`);
  if (!STATUS_TRANSITIONS[from].includes(to)) {
    throw ApiError.unprocessable(`Invalid status transition: ${from} → ${to}`, [{ allowed: STATUS_TRANSITIONS[from] }]);
  }

  // Optimistic concurrency: only update if nobody changed the status in the meantime.
  const update = {
    $set: { status: to },
    $push: { statusHistory: { status: to, changedBy: user._id, note, at: new Date() } },
  };
  if (to === 'cancelled' && order.payment.status === 'paid') update.$set['payment.status'] = 'refunded';
  if (to === 'delivered' && order.payment.method === 'COD') {
    update.$set['payment.status'] = 'paid';
    update.$set['payment.paidAt'] = new Date();
  }
  const updated = await Order.findOneAndUpdate({ _id: order._id, status: from }, update, { new: true });
  if (!updated) throw ApiError.conflict('Order was modified concurrently; please retry');

  if (to === 'cancelled') await inventory.restoreItems(order.items, { order: order._id, by: user._id });
  eventBus.emit(EVENTS.ORDER_STATUS_CHANGED, { order: updated, from, to, by: user._id });
  return updated;
}

module.exports = { checkout, getById, list, updateStatus, simulatePayment };
