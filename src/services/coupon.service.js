const Coupon = require('../models/Coupon');
const ApiError = require('../utils/ApiError');

const round2 = (n) => Math.round(n * 100) / 100;

async function evaluate(code, subtotal) {
  const coupon = await Coupon.findOne({ code: code.toUpperCase() });
  if (!coupon || !coupon.isActive) throw ApiError.unprocessable('Coupon code is invalid');
  if (coupon.expiresAt < new Date()) throw ApiError.unprocessable('Coupon has expired');
  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) throw ApiError.unprocessable('Coupon usage limit reached');
  if (subtotal < coupon.minOrderValue) {
    throw ApiError.unprocessable(`Coupon requires a minimum order value of ₹${coupon.minOrderValue}`);
  }
  let discount = coupon.type === 'percent' ? (subtotal * coupon.value) / 100 : coupon.value;
  if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
  discount = round2(Math.min(discount, subtotal));
  return { coupon, discount };
}

// Atomic usage increment that respects usageLimit under concurrency.
async function consume(coupon) {
  const filter = { _id: coupon._id };
  if (coupon.usageLimit) filter.usedCount = { $lt: coupon.usageLimit };
  const res = await Coupon.updateOne(filter, { $inc: { usedCount: 1 } });
  if (res.modifiedCount === 0) throw ApiError.unprocessable('Coupon usage limit reached');
}

module.exports = { evaluate, consume, round2 };
