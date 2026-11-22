const { eventBus, EVENTS } = require('./eventBus');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { emitToUser, emitToRole, emitToRoom } = require('../sockets');
const config = require('../config/env');

// Persist a notification, then push it live to the user's socket room.
async function notify(userId, type, title, message, data) {
  const doc = await Notification.create({ user: userId, type, title, message, data });
  emitToUser(userId, 'notification', doc.toJSON());
  return doc;
}

function safe(handler) {
  return (...args) =>
    Promise.resolve(handler(...args)).catch((err) => {
      if (!config.isTest) console.error('[events] listener failed', err);
    });
}

function registerListeners() {
  // order.placed -> tell each seller involved, and push a live event to admins.
  eventBus.on(EVENTS.ORDER_PLACED, safe(async ({ order }) => {
    const sellers = [...new Set(order.items.map((i) => i.seller.toString()))];
    await Promise.all(
      sellers.map((sellerId) => {
        const items = order.items.filter((i) => i.seller.toString() === sellerId);
        const qty = items.reduce((s, i) => s + i.quantity, 0);
        emitToUser(sellerId, 'order:new', { orderId: order._id, orderNumber: order.orderNumber, items, total: order.total });
        return notify(sellerId, EVENTS.ORDER_PLACED, 'New order received',
          `Order ${order.orderNumber} includes ${qty} unit(s) of your products.`,
          { orderId: order._id, orderNumber: order.orderNumber });
      })
    );
    emitToRole('admin', 'order:new', { orderId: order._id, orderNumber: order.orderNumber, total: order.total });
    await notify(order.customer, EVENTS.ORDER_PLACED, 'Order placed',
      `Your order ${order.orderNumber} for ₹${order.total.toFixed(2)} was placed.`,
      { orderId: order._id, orderNumber: order.orderNumber });
  }));

  // order.status_changed -> tell the customer in real time.
  eventBus.on(EVENTS.ORDER_STATUS_CHANGED, safe(async ({ order, from, to }) => {
    emitToUser(order.customer, 'order:status', { orderId: order._id, orderNumber: order.orderNumber, from, to });
    await notify(order.customer, EVENTS.ORDER_STATUS_CHANGED, `Order ${to}`,
      `Your order ${order.orderNumber} is now ${to}.`, { orderId: order._id, from, to });
  }));

  // stock.low -> warn the product's seller and all admins.
  eventBus.on(EVENTS.STOCK_LOW, safe(async ({ product }) => {
    const payload = { productId: product._id, name: product.name, stock: product.stock, threshold: product.lowStockThreshold };
    const admins = await User.find({ role: 'admin', isActive: true }).select('_id');
    const recipients = [...new Set([product.seller.toString(), ...admins.map((a) => a._id.toString())])];
    emitToRole('admin', 'stock:low', payload);
    await Promise.all(recipients.map((id) => {
      if (id === product.seller.toString()) emitToUser(id, 'stock:low', payload);
      return notify(id, EVENTS.STOCK_LOW, 'Low stock alert',
        `${product.name} has only ${product.stock} left (threshold ${product.lowStockThreshold}).`, payload);
    }));
  }));

  // stock.changed -> anyone viewing the product page sees the live stock count.
  eventBus.on(EVENTS.STOCK_CHANGED, ({ productId, stock }) => {
    emitToRoom(`product:${productId}`, 'product:stock', { productId, stock });
  });
}

module.exports = { registerListeners };
