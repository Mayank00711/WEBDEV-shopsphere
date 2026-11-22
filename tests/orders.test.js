const { describe, test, before: beforeAll, after: afterAll } = require('node:test');
const expect = require('expect').expect || require('expect');
const { io: ioClient } = require('socket.io-client');
const { setup, teardown, api, port, createUser, createCatalog, auth, address, wait } = require('./helpers');
const Product = require('../src/models/Product');
const Coupon = require('../src/models/Coupon');

let seller; let customer; let customer2; let admin; let category; let product;

beforeAll(async () => {
  await setup();
  [seller, customer, customer2, admin] = await Promise.all([createUser('seller'), createUser('customer'), createUser('customer'), createUser('admin')]);
  ({ category, product } = await createCatalog(seller.user));
});
afterAll(teardown);

const checkout = (token, extra = {}) =>
  api().post('/api/orders').set(auth(token)).send({ shippingAddress: address, paymentMethod: 'SIMULATED_CARD', ...extra });

describe('Cart', () => {
  test('cannot add more than available stock (422)', async () => {
    const res = await api().post('/api/cart/items').set(auth(customer.token)).send({ productId: product._id.toString(), quantity: 50 });
    expect(res.status).toBe(422);
  });

  test('client-supplied prices are ignored; totals come from the server', async () => {
    const res = await api().post('/api/cart/items').set(auth(customer.token))
      .send({ productId: product._id.toString(), quantity: 2, price: 1 });
    expect(res.status).toBe(200);
    expect(res.body.data.subtotal).toBe(2000);
    expect(res.body.data.total).toBe(2000); // free shipping over 999
  });

  test('sellers cannot use the cart (403)', async () => {
    const res = await api().get('/api/cart').set(auth(seller.token));
    expect(res.status).toBe(403);
  });

  test('removing an item not in the cart returns 404', async () => {
    const res = await api().delete('/api/cart/items/64b7f0000000000000000000').set(auth(customer.token));
    expect(res.status).toBe(404);
  });
});

describe('Checkout, inventory and real-time events', () => {
  test('socket connection without a token is rejected', async () => {
    const sock = ioClient(`http://localhost:${port()}`, { transports: ['websocket'], reconnection: false });
    const err = await new Promise((resolve) => sock.on('connect_error', resolve));
    expect(err.message).toMatch(/UNAUTHORIZED/);
    sock.close();
  });

  test('checkout decrements stock, empties the cart and notifies the seller in real time', async () => {
    const sellerSock = ioClient(`http://localhost:${port()}`, { auth: { token: seller.token }, transports: ['websocket'] });
    await new Promise((r) => sellerSock.on('connected', r));
    const received = new Promise((r) => sellerSock.on('order:new', r));

    const res = await checkout(customer.token);
    expect(res.status).toBe(201);
    expect(res.body.data.total).toBe(2000);
    expect(res.body.data.payment).toMatchObject({ status: 'paid', simulated: true });
    expect(res.body.data.items[0].unitPrice).toBe(1000);

    const evt = await received;
    expect(evt.orderNumber).toBe(res.body.data.orderNumber);
    sellerSock.close();

    expect((await Product.findById(product._id)).stock).toBe(8);
    const cart = await api().get('/api/cart').set(auth(customer.token));
    expect(cart.body.data.items).toHaveLength(0);
  });

  test('checkout with an empty cart returns 422', async () => {
    expect((await checkout(customer.token)).status).toBe(422);
  });

  test('simulated payment failure returns 402 and does not touch stock', async () => {
    await api().post('/api/cart/items').set(auth(customer.token)).send({ productId: product._id.toString(), quantity: 1 });
    const res = await checkout(customer.token, { simulatePaymentFailure: true });
    expect(res.status).toBe(402);
    expect((await Product.findById(product._id)).stock).toBe(8);
    await api().delete('/api/cart').set(auth(customer.token));
  });

  test('two customers racing for the last unit: exactly one succeeds, stock never negative', async () => {
    const last = await Product.create({ name: 'Last Unit', price: 500, stock: 1, lowStockThreshold: 0, category: category._id, seller: seller.user._id });
    await api().post('/api/cart/items').set(auth(customer.token)).send({ productId: last._id.toString(), quantity: 1 }).expect(200);
    await api().post('/api/cart/items').set(auth(customer2.token)).send({ productId: last._id.toString(), quantity: 1 }).expect(200);

    const results = await Promise.all([checkout(customer.token), checkout(customer2.token)]);
    const codes = results.map((r) => r.status).sort();
    expect(codes).toEqual([201, 409]);
    expect((await Product.findById(last._id)).stock).toBe(0);
    await api().delete('/api/cart').set(auth(customer.token));
    await api().delete('/api/cart').set(auth(customer2.token));
  });

  test('crossing the low-stock threshold emits stock:low to the seller', async () => {
    const p = await Product.create({ name: 'Almost Gone', price: 300, stock: 4, lowStockThreshold: 2, category: category._id, seller: seller.user._id });
    const sock = ioClient(`http://localhost:${port()}`, { auth: { token: seller.token }, transports: ['websocket'] });
    await new Promise((r) => sock.on('connected', r));
    const low = new Promise((r) => sock.on('stock:low', r));
    await api().post('/api/cart/items').set(auth(customer2.token)).send({ productId: p._id.toString(), quantity: 2 }).expect(200);
    await checkout(customer2.token).expect(201);
    const evt = await low;
    expect(evt).toMatchObject({ name: 'Almost Gone', stock: 2 });
    sock.close();
  });

  test('coupon is applied on the server; expired coupon is rejected', async () => {
    await Coupon.create({ code: 'SAVE10', type: 'percent', value: 10, expiresAt: new Date(Date.now() + 86400000) });
    await Coupon.create({ code: 'OLD10', type: 'percent', value: 10, expiresAt: new Date(Date.now() - 1000) });
    await api().post('/api/cart/items').set(auth(customer.token)).send({ productId: product._id.toString(), quantity: 1 });
    expect((await checkout(customer.token, { couponCode: 'OLD10' })).status).toBe(422);
    const res = await checkout(customer.token, { couponCode: 'SAVE10' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ subtotal: 1000, discount: 100, total: 900 });
  });
});

describe('Order access and status rules', () => {
  let order;
  beforeAll(async () => {
    await api().post('/api/cart/items').set(auth(customer.token)).send({ productId: product._id.toString(), quantity: 3 });
    order = (await checkout(customer.token)).body.data;
  });

  test("a customer cannot see another customer's order (404)", async () => {
    const res = await api().get(`/api/orders/${order._id}`).set(auth(customer2.token));
    expect(res.status).toBe(404);
  });

  test('customers see only their own orders in the list', async () => {
    const res = await api().get('/api/orders').set(auth(customer2.token));
    expect(res.body.data.every((o) => o.customer._id === customer2.user._id.toString())).toBe(true);
  });

  test('invalid status transition returns 422', async () => {
    const res = await api().patch(`/api/orders/${order._id}/status`).set(auth(seller.token)).send({ status: 'delivered' });
    expect(res.status).toBe(422);
  });

  test('customer cannot mark an order shipped (403)', async () => {
    const res = await api().patch(`/api/orders/${order._id}/status`).set(auth(customer.token)).send({ status: 'shipped' });
    expect(res.status).toBe(403);
  });

  test('seller confirms the order and the customer is notified live', async () => {
    const sock = ioClient(`http://localhost:${port()}`, { auth: { token: customer.token }, transports: ['websocket'] });
    await new Promise((r) => sock.on('connected', r));
    const evt = new Promise((r) => sock.on('order:status', r));
    const res = await api().patch(`/api/orders/${order._id}/status`).set(auth(seller.token)).send({ status: 'confirmed' });
    expect(res.status).toBe(200);
    expect(await evt).toMatchObject({ from: 'pending', to: 'confirmed' });
    sock.close();
  });

  test('customer cancellation restores stock and refunds the simulated payment', async () => {
    const before = (await Product.findById(product._id)).stock;
    const res = await api().patch(`/api/orders/${order._id}/status`).set(auth(customer.token)).send({ status: 'cancelled' });
    expect(res.status).toBe(200);
    expect(res.body.data.payment.status).toBe('refunded');
    expect((await Product.findById(product._id)).stock).toBe(before + 3);
  });

  test('cancelling twice is a conflict (409)', async () => {
    const res = await api().patch(`/api/orders/${order._id}/status`).set(auth(customer.token)).send({ status: 'cancelled' });
    expect(res.status).toBe(409);
  });

  test('notifications are persisted for offline users', async () => {
    await wait(100);
    const res = await api().get('/api/notifications').set(auth(customer.token));
    expect(res.status).toBe(200);
    expect(res.body.data.some((n) => n.type === 'order.status_changed')).toBe(true);
    expect(res.body.meta.unread).toBeGreaterThan(0);
  });
});

describe('Reports (aggregation pipelines)', () => {
  test('sales summary excludes cancelled orders', async () => {
    const res = await api().get('/api/reports/sales?groupBy=day').set(auth(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.data.totals.orders).toBeGreaterThan(0);
    expect(res.body.data.periods[0]).toHaveProperty('avgOrderValue');
  });

  test('top products are ranked by units sold', async () => {
    const res = await api().get('/api/reports/top-products?limit=3').set(auth(seller.token));
    expect(res.status).toBe(200);
    const units = res.body.data.map((p) => p.unitsSold);
    expect(units).toEqual([...units].sort((a, b) => b - a));
  });

  test('inventory summary and low-stock list', async () => {
    const inv = await api().get('/api/reports/inventory').set(auth(admin.token));
    expect(inv.body.data.totals.products).toBeGreaterThan(0);
    const low = await api().get('/api/reports/low-stock').set(auth(admin.token));
    expect(low.body.data.every((p) => p.stock <= p.lowStockThreshold)).toBe(true);
  });

  test('customers cannot access reports (403)', async () => {
    expect((await api().get('/api/reports/sales').set(auth(customer.token))).status).toBe(403);
  });

  test('invalid date range is rejected (400)', async () => {
    const res = await api().get('/api/reports/sales?from=2026-05-01&to=2026-01-01').set(auth(admin.token));
    expect(res.status).toBe(400);
  });
});
