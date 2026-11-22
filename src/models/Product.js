const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    price: { type: Number, required: true, min: [0, 'Price cannot be negative'] },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    stock: {
      type: Number,
      required: true,
      min: [0, 'Stock cannot be negative'],
      validate: { validator: Number.isInteger, message: 'Stock must be an integer' },
    },
    lowStockThreshold: { type: Number, default: 5, min: 0 },
    sku: { type: String, trim: true, uppercase: true, unique: true, sparse: true },
    images: [{ type: String, trim: true }],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Index 1: full-text search on name + description (GET /api/products?search=)
productSchema.index({ name: 'text', description: 'text' }, { weights: { name: 5, description: 1 } });
// Index 2: the most common catalogue filter: by category, sorted/filtered by price
productSchema.index({ category: 1, price: 1 });
// Index 3: seller dashboards and ownership checks
productSchema.index({ seller: 1, createdAt: -1 });

productSchema.virtual('isLowStock').get(function isLowStock() {
  return this.stock <= this.lowStockThreshold;
});

productSchema.set('toJSON', { virtuals: true, versionKey: false });

module.exports = mongoose.model('Product', productSchema);
