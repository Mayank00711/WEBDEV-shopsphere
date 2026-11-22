const Product = require('../models/Product');
const Category = require('../models/Category');
const User = require('../models/User');
const StockMovement = require('../models/StockMovement');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const inventory = require('../services/inventory.service');
const { ok, created } = require('../utils/response');
const { getPagination, buildMeta } = require('../utils/pagination');

const SORTS = {
  price: { price: 1 }, '-price': { price: -1 }, name: { name: 1 }, '-name': { name: -1 },
  createdAt: { createdAt: 1 }, '-createdAt': { createdAt: -1 }, stock: { stock: 1 }, '-stock': { stock: -1 },
};

function buildFilter(q, base = {}) {
  const filter = { ...base };
  if (q.search) filter.$text = { $search: q.search };
  if (q.category) filter.category = q.category;
  if (q.seller) filter.seller = q.seller;
  if (q.minPrice !== undefined || q.maxPrice !== undefined) {
    filter.price = {};
    if (q.minPrice !== undefined) filter.price.$gte = q.minPrice;
    if (q.maxPrice !== undefined) filter.price.$lte = q.maxPrice;
  }
  if (q.inStock) filter.stock = { $gt: 0 };
  return filter;
}

async function runList(req, res, base) {
  const { page, limit, skip } = getPagination(req.query, 12);
  if (req.query.minPrice !== undefined && req.query.maxPrice !== undefined && req.query.minPrice > req.query.maxPrice) {
    throw ApiError.badRequest('minPrice cannot be greater than maxPrice');
  }
  const filter = buildFilter(req.query, base);
  const sort = req.query.search && req.query.sort === '-createdAt' ? { score: { $meta: 'textScore' } } : SORTS[req.query.sort];
  const [products, total] = await Promise.all([
    Product.find(filter).sort(sort).skip(skip).limit(limit)
      .populate('category', 'name slug').populate('seller', 'name storeName'),
    Product.countDocuments(filter),
  ]);
  ok(res, products, 'OK', buildMeta(total, page, limit));
}

// Public catalogue: only active products.
exports.list = asyncHandler((req, res) => runList(req, res, { isActive: true }));

// Seller/admin inventory view: includes inactive products. Sellers see only their own.
exports.listMine = asyncHandler((req, res) =>
  runList(req, res, req.user.role === 'seller' ? { seller: req.user._id } : {}));

exports.getById = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id).populate('category', 'name slug').populate('seller', 'name storeName');
  if (!product || !product.isActive) throw ApiError.notFound('Product not found');
  ok(res, product);
});

async function assertCategory(id) {
  const cat = await Category.findById(id);
  if (!cat || !cat.isActive) throw ApiError.badRequest('Category does not exist', [{ field: 'category', message: 'Unknown category' }]);
}

// Ownership rule: a seller may only modify their own products; admins may modify any.
async function loadOwned(req) {
  const product = await Product.findById(req.params.id);
  if (!product) throw ApiError.notFound('Product not found');
  if (req.user.role === 'seller' && product.seller.toString() !== req.user._id.toString()) {
    throw ApiError.forbidden('You can only manage your own products');
  }
  return product;
}

exports.create = asyncHandler(async (req, res) => {
  await assertCategory(req.body.category);
  let seller = req.user._id;
  if (req.user.role === 'admin' && req.body.seller) {
    const s = await User.findOne({ _id: req.body.seller, role: 'seller' });
    if (!s) throw ApiError.badRequest('seller must reference an existing seller account');
    seller = s._id;
  } else if (req.body.seller && req.user.role !== 'admin') {
    throw ApiError.forbidden('Sellers cannot create products for another seller');
  }
  const product = await Product.create({ ...req.body, seller });
  await StockMovement.create({ product: product._id, change: product.stock, reason: 'restock', by: req.user._id, stockAfter: product.stock });
  created(res, product, 'Product created');
});

exports.update = asyncHandler(async (req, res) => {
  const product = await loadOwned(req);
  if (req.body.category) await assertCategory(req.body.category);
  Object.assign(product, req.body);
  await product.save();
  ok(res, product, 'Product updated');
});

exports.remove = asyncHandler(async (req, res) => {
  const product = await loadOwned(req);
  await product.deleteOne();
  ok(res, null, 'Product deleted');
});

exports.adjustStock = asyncHandler(async (req, res) => {
  const product = await loadOwned(req);
  const updated = await inventory.adjust(product, req.body.change, req.body.reason, req.user._id);
  ok(res, updated, 'Stock updated');
});

exports.stockHistory = asyncHandler(async (req, res) => {
  await loadOwned(req);
  const history = await StockMovement.find({ product: req.params.id }).sort({ createdAt: -1 }).limit(50).populate('by', 'name role');
  ok(res, history);
});
