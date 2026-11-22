const { EventEmitter } = require('events');

// A single in-process event bus. Services emit domain events here and never talk to
// Socket.IO or the Notification model directly, which keeps business logic decoupled
// from delivery concerns (Unit 4: EventEmitter).
class EventBus extends EventEmitter {}

const eventBus = new EventBus();
eventBus.setMaxListeners(20);

const EVENTS = Object.freeze({
  ORDER_PLACED: 'order.placed',
  ORDER_STATUS_CHANGED: 'order.status_changed',
  STOCK_LOW: 'stock.low',
  STOCK_CHANGED: 'stock.changed',
});

module.exports = { eventBus, EVENTS };
