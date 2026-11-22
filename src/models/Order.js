const mongoose = require('mongoose');

const ORDER_STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];

// Allowed status transitions. Anything not listed here is rejected with 422.
const STATUS_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Snapshots: later price/name changes on the product do not alter past orders.
    name: { type: String, required: true },
    unitPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, unique: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    items: {
      type: [orderItemSchema],
      validate: [(v) => v.length > 0, 'Order must contain at least one item'],
    },
    subtotal: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    couponCode: { type: String },
    shippingFee: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    shippingAddress: {
      fullName: { type: String, required: true },
      line1: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      postalCode: { type: String, required: true },
      country: { type: String, default: 'India' },
      phone: { type: String, required: true },
    },
    status: { type: String, enum: ORDER_STATUSES, default: 'pending' },
    statusHistory: [
      {
        _id: false,
        status: String,
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        note: String,
        at: { type: Date, default: Date.now },
      },
    ],
    payment: {
      method: { type: String, enum: ['SIMULATED_CARD', 'SIMULATED_UPI', 'COD'], required: true },
      status: { type: String, enum: ['pending', 'paid', 'refunded'], default: 'pending' },
      transactionId: String,
      // Explicit flag required by the brief: no real payment gateway is integrated.
      simulated: { type: Boolean, default: true },
      paidAt: Date,
    },
  },
  { timestamps: true, versionKey: false }
);

// Index: customer order history, newest first
orderSchema.index({ customer: 1, createdAt: -1 });
// Index: seller's incoming orders and the sales reports (multikey on items.seller)
orderSchema.index({ 'items.seller': 1, createdAt: -1 });
// Index: admin filtering and the date-range sales aggregation
orderSchema.index({ status: 1, createdAt: -1 });

orderSchema.pre('validate', function setOrderNumber() {
  if (!this.orderNumber) {
    const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
    this.orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}-${rand}`;
  }
});

module.exports = mongoose.model('Order', orderSchema);
module.exports.ORDER_STATUSES = ORDER_STATUSES;
module.exports.STATUS_TRANSITIONS = STATUS_TRANSITIONS;
