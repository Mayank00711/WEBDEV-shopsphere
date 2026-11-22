const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');

const oid = (id) => new mongoose.Types.ObjectId(String(id));

// Sellers always see only their own numbers; admins may optionally filter by seller.
function sellerScope(user, sellerParam) {
  if (user.role === 'seller') return oid(user._id);
  return sellerParam ? oid(sellerParam) : null;
}

function matchStage({ from, to }) {
  const match = { status: { $ne: 'cancelled' } };
  if (from || to) match.createdAt = { ...(from && { $gte: new Date(from) }), ...(to && { $lte: new Date(to) }) };
  return { $match: match };
}

// Aggregation 1: revenue and order counts grouped by day or month.
async function salesSummary(user, { from, to, groupBy, seller }) {
  const s = sellerScope(user, seller);
  const fmt = groupBy === 'month' ? '%Y-%m' : '%Y-%m-%d';
  const pipeline = [
    matchStage({ from, to }),
    ...(s ? [{ $match: { 'items.seller': s } }] : []),
    { $unwind: '$items' },
    ...(s ? [{ $match: { 'items.seller': s } }] : []),
    {
      $group: {
        _id: { period: { $dateToString: { format: fmt, date: '$createdAt', timezone: 'Asia/Kolkata' } }, order: '$_id' },
        revenue: { $sum: '$items.lineTotal' },
        units: { $sum: '$items.quantity' },
      },
    },
    {
      $group: {
        _id: '$_id.period',
        revenue: { $sum: '$revenue' },
        units: { $sum: '$units' },
        orders: { $sum: 1 },
      },
    },
    { $addFields: { avgOrderValue: { $round: [{ $divide: ['$revenue', '$orders'] }, 2] }, revenue: { $round: ['$revenue', 2] } } },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, period: '$_id', revenue: 1, orders: 1, units: 1, avgOrderValue: 1 } },
  ];
  const periods = await Order.aggregate(pipeline);
  const totals = periods.reduce(
    (t, p) => ({ revenue: t.revenue + p.revenue, orders: t.orders + p.orders, units: t.units + p.units }),
    { revenue: 0, orders: 0, units: 0 }
  );
  totals.revenue = Math.round(totals.revenue * 100) / 100;
  totals.avgOrderValue = totals.orders ? Math.round((totals.revenue / totals.orders) * 100) / 100 : 0;
  return { groupBy, totals, periods };
}

// Aggregation 2: best-selling products by units sold, with product details via $lookup.
async function topProducts(user, { from, to, limit, seller }) {
  const s = sellerScope(user, seller);
  return Order.aggregate([
    matchStage({ from, to }),
    { $unwind: '$items' },
    ...(s ? [{ $match: { 'items.seller': s } }] : []),
    {
      $group: {
        _id: '$items.product',
        name: { $first: '$items.name' },
        unitsSold: { $sum: '$items.quantity' },
        revenue: { $sum: '$items.lineTotal' },
        orders: { $addToSet: '$_id' },
      },
    },
    { $sort: { unitsSold: -1, revenue: -1 } },
    { $limit: limit },
    { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
    { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        productId: '$_id',
        name: 1,
        unitsSold: 1,
        revenue: { $round: ['$revenue', 2] },
        orderCount: { $size: '$orders' },
        currentStock: '$product.stock',
        currentPrice: '$product.price',
      },
    },
  ]);
}

// Aggregation 3: revenue share per category.
async function categorySales(user, { from, to, seller }) {
  const s = sellerScope(user, seller);
  return Order.aggregate([
    matchStage({ from, to }),
    { $unwind: '$items' },
    ...(s ? [{ $match: { 'items.seller': s } }] : []),
    { $lookup: { from: 'products', localField: 'items.product', foreignField: '_id', as: 'p' } },
    { $unwind: '$p' },
    { $group: { _id: '$p.category', revenue: { $sum: '$items.lineTotal' }, units: { $sum: '$items.quantity' } } },
    { $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'c' } },
    { $unwind: '$c' },
    { $sort: { revenue: -1 } },
    { $project: { _id: 0, categoryId: '$_id', category: '$c.name', revenue: { $round: ['$revenue', 2] }, units: 1 } },
  ]);
}

// Aggregation 4: inventory summary per category using $facet for overall totals.
async function inventorySummary(user, { seller }) {
  const s = sellerScope(user, seller);
  const [result] = await Product.aggregate([
    { $match: { isActive: true, ...(s && { seller: s }) } },
    {
      $facet: {
        byCategory: [
          {
            $group: {
              _id: '$category',
              products: { $sum: 1 },
              unitsInStock: { $sum: '$stock' },
              stockValue: { $sum: { $multiply: ['$stock', '$price'] } },
              lowStock: { $sum: { $cond: [{ $lte: ['$stock', '$lowStockThreshold'] }, 1, 0] } },
              outOfStock: { $sum: { $cond: [{ $eq: ['$stock', 0] }, 1, 0] } },
            },
          },
          { $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'c' } },
          { $unwind: '$c' },
          { $project: { _id: 0, categoryId: '$_id', category: '$c.name', products: 1, unitsInStock: 1, stockValue: { $round: ['$stockValue', 2] }, lowStock: 1, outOfStock: 1 } },
          { $sort: { stockValue: -1 } },
        ],
        totals: [
          {
            $group: {
              _id: null,
              products: { $sum: 1 },
              unitsInStock: { $sum: '$stock' },
              stockValue: { $sum: { $multiply: ['$stock', '$price'] } },
              lowStock: { $sum: { $cond: [{ $lte: ['$stock', '$lowStockThreshold'] }, 1, 0] } },
              outOfStock: { $sum: { $cond: [{ $eq: ['$stock', 0] }, 1, 0] } },
            },
          },
          { $project: { _id: 0, products: 1, unitsInStock: 1, stockValue: { $round: ['$stockValue', 2] }, lowStock: 1, outOfStock: 1 } },
        ],
      },
    },
  ]);
  return {
    totals: result.totals[0] || { products: 0, unitsInStock: 0, stockValue: 0, lowStock: 0, outOfStock: 0 },
    byCategory: result.byCategory,
  };
}

async function lowStock(user, { seller, limit }) {
  const s = sellerScope(user, seller);
  return Product.aggregate([
    { $match: { isActive: true, ...(s && { seller: s }), $expr: { $lte: ['$stock', '$lowStockThreshold'] } } },
    { $sort: { stock: 1 } },
    { $limit: limit },
    { $lookup: { from: 'users', localField: 'seller', foreignField: '_id', as: 's' } },
    { $unwind: '$s' },
    { $project: { _id: 0, productId: '$_id', name: 1, sku: 1, stock: 1, lowStockThreshold: 1, seller: '$s.name', storeName: '$s.storeName' } },
  ]);
}

module.exports = { salesSummary, topProducts, categorySales, inventorySummary, lowStock };
