const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, match: /^[A-Z0-9]{3,20}$/ },
    type: { type: String, enum: ['percent', 'flat'], required: true },
    value: { type: Number, required: true, min: 0 },
    maxDiscount: { type: Number, min: 0 }, // cap for percent coupons
    minOrderValue: { type: Number, default: 0, min: 0 },
    expiresAt: { type: Date, required: true },
    usageLimit: { type: Number, min: 1 },
    usedCount: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false }
);

couponSchema.path('value').validate(function percentCap(v) {
  return this.type !== 'percent' || v <= 100;
}, 'Percent coupons cannot exceed 100');

module.exports = mongoose.model('Coupon', couponSchema);
