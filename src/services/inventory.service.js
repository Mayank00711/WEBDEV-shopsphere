const Product = require('../models/Product');
const StockMovement = require('../models/StockMovement');
const ApiError = require('../utils/ApiError');
const { eventBus, EVENTS } = require('../events/eventBus');

// Atomically reserve stock. The filter `stock >= qty` and the $inc happen in ONE
// database operation, so two customers buying the last unit cannot both succeed and
// stock can never become negative, even without a transaction.
async function decrementStock(productId, qty) {
  return Product.findOneAndUpdate(
    { _id: productId, isActive: true, stock: { $gte: qty } },
    { $inc: { stock: -qty } },
    { new: true }
  );
}

async function incrementStock(productId, qty) {
  return Product.findOneAndUpdate({ _id: productId }, { $inc: { stock: qty } }, { new: true });
}

async function record(product, change, reason, { order, by } = {}) {
  await StockMovement.create({ product: product._id, change, reason, order, by, stockAfter: product.stock });
  eventBus.emit(EVENTS.STOCK_CHANGED, { productId: product._id.toString(), stock: product.stock });
  // Fire stock.low only when this change crossed the threshold downward.
  if (change < 0 && product.stock <= product.lowStockThreshold && product.stock - change > product.lowStockThreshold) {
    eventBus.emit(EVENTS.STOCK_LOW, { product });
  }
}

// Reserve all items or none. If any item fails, previously reserved items are restored.
async function reserveItems(items, ctx) {
  const reserved = [];
  for (const item of items) {
    const updated = await decrementStock(item.product, item.quantity);
    if (!updated) {
      await Promise.all(reserved.map((r) => incrementStock(r.product, r.quantity)));
      const current = await Product.findById(item.product).select('stock name');
      throw ApiError.conflict(`Insufficient stock for "${item.name}"`, [
        { product: item.product, requested: item.quantity, available: current ? current.stock : 0 },
      ]);
    }
    reserved.push({ product: item.product, quantity: item.quantity, doc: updated });
  }
  await Promise.all(reserved.map((r) => record(r.doc, -r.quantity, 'order', ctx)));
  return reserved;
}

async function restoreItems(items, ctx) {
  for (const item of items) {
    const updated = await incrementStock(item.product, item.quantity);
    if (updated) await record(updated, item.quantity, 'cancellation', ctx);
  }
}

async function releaseReservation(reserved) {
  await Promise.all(reserved.map((r) => incrementStock(r.product, r.quantity)));
}

async function adjust(product, change, reason, by) {
  const filter = { _id: product._id };
  if (change < 0) filter.stock = { $gte: -change };
  const updated = await Product.findOneAndUpdate(filter, { $inc: { stock: change } }, { new: true });
  if (!updated) throw ApiError.unprocessable(`Cannot remove ${-change} units; only ${product.stock} in stock`);
  await record(updated, change, reason, { by });
  return updated;
}

module.exports = { reserveItems, restoreItems, releaseReservation, adjust, decrementStock };
