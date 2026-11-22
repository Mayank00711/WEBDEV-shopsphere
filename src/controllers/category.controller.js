const Category = require('../models/Category');
const Product = require('../models/Product');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');

exports.list = asyncHandler(async (_req, res) => {
  const categories = await Category.aggregate([
    { $match: { isActive: true } },
    { $lookup: { from: 'products', let: { c: '$_id' }, pipeline: [{ $match: { $expr: { $eq: ['$category', '$$c'] }, isActive: true } }, { $count: 'n' }], as: 'count' } },
    { $addFields: { productCount: { $ifNull: [{ $first: '$count.n' }, 0] } } },
    { $project: { count: 0, __v: 0 } },
    { $sort: { name: 1 } },
  ]);
  ok(res, categories);
});

exports.getById = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) throw ApiError.notFound('Category not found');
  ok(res, category);
});

exports.create = asyncHandler(async (req, res) => {
  const category = await Category.create(req.body);
  created(res, category, 'Category created');
});

exports.update = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) throw ApiError.notFound('Category not found');
  Object.assign(category, req.body);
  await category.save();
  ok(res, category, 'Category updated');
});

exports.remove = asyncHandler(async (req, res) => {
  const inUse = await Product.countDocuments({ category: req.params.id });
  if (inUse > 0) throw ApiError.conflict(`Category is used by ${inUse} product(s); reassign or delete them first`);
  const category = await Category.findByIdAndDelete(req.params.id);
  if (!category) throw ApiError.notFound('Category not found');
  ok(res, null, 'Category deleted');
});
