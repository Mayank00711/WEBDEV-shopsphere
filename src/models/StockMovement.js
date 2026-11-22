const mongoose = require('mongoose');

// Audit trail for inventory: every stock change (sale, cancellation, restock) is recorded.
const stockMovementSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    change: { type: Number, required: true }, // negative = stock out
    reason: { type: String, enum: ['order', 'cancellation', 'restock', 'adjustment'], required: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    stockAfter: { type: Number, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

stockMovementSchema.index({ product: 1, createdAt: -1 });

module.exports = mongoose.model('StockMovement', stockMovementSchema);
