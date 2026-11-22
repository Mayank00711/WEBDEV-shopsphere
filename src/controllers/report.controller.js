const reports = require('../services/report.service');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');

exports.sales = asyncHandler(async (req, res) => ok(res, await reports.salesSummary(req.user, req.query)));
exports.topProducts = asyncHandler(async (req, res) => ok(res, await reports.topProducts(req.user, req.query)));
exports.categorySales = asyncHandler(async (req, res) => ok(res, await reports.categorySales(req.user, req.query)));
exports.inventory = asyncHandler(async (req, res) => ok(res, await reports.inventorySummary(req.user, req.query)));
exports.lowStock = asyncHandler(async (req, res) => ok(res, await reports.lowStock(req.user, req.query)));
