const { describe, test, before: beforeAll, after: afterAll } = require('node:test');
const expect = require('expect').expect || require('expect');
const { setup, teardown, api, createUser, createCatalog, auth } = require('./helpers');

let seller; let otherSeller; let customer; let admin; let category; let product;

beforeAll(async () => {
  await setup();
  [seller, otherSeller, customer, admin] = await Promise.all([createUser('seller'), createUser('seller'), createUser('customer'), createUser('admin')]);
  ({ category, product } = await createCatalog(seller.user));
});
afterAll(teardown);

describe('Products', () => {
  test('anyone can list products with pagination meta', async () => {
    const res = await api().get('/api/products?limit=5');
    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 5 });
  });

  test('text search uses the text index', async () => {
    const res = await api().get('/api/products?search=headphones');
    expect(res.status).toBe(200);
    expect(res.body.data[0].name).toBe('Test Headphones');
  });

  test('price filter validation: minPrice > maxPrice is rejected', async () => {
    const res = await api().get('/api/products?minPrice=500&maxPrice=100');
    expect(res.status).toBe(400);
  });

  test('seller creates a product (201) owned by them', async () => {
    const res = await api().post('/api/products').set(auth(seller.token))
      .send({ name: 'Smart Lamp', price: 1499, stock: 5, category: category._id.toString() });
    expect(res.status).toBe(201);
    expect(res.body.data.seller).toBe(seller.user._id.toString());
  });

  test('negative price fails validation (400)', async () => {
    const res = await api().post('/api/products').set(auth(seller.token))
      .send({ name: 'Bad', price: -1, stock: 5, category: category._id.toString() });
    expect(res.status).toBe(400);
  });

  test('unknown category is rejected (400)', async () => {
    const res = await api().post('/api/products').set(auth(seller.token))
      .send({ name: 'Orphan', price: 10, stock: 1, category: '64b7f0000000000000000000' });
    expect(res.status).toBe(400);
  });

  test('customer cannot create products (403)', async () => {
    const res = await api().post('/api/products').set(auth(customer.token))
      .send({ name: 'Nope', price: 10, stock: 1, category: category._id.toString() });
    expect(res.status).toBe(403);
  });

  test('no token cannot create products (401)', async () => {
    const res = await api().post('/api/products').send({ name: 'Nope', price: 10, stock: 1, category: category._id.toString() });
    expect(res.status).toBe(401);
  });

  test("seller cannot edit another seller's product (403)", async () => {
    const res = await api().patch(`/api/products/${product._id}`).set(auth(otherSeller.token)).send({ price: 1 });
    expect(res.status).toBe(403);
  });

  test('admin can edit any product', async () => {
    const res = await api().patch(`/api/products/${product._id}`).set(auth(admin.token)).send({ price: 1100 });
    expect(res.status).toBe(200);
    expect(res.body.data.price).toBe(1100);
  });

  test('stock cannot be changed through the general update endpoint', async () => {
    const res = await api().patch(`/api/products/${product._id}`).set(auth(seller.token)).send({ stock: 999 });
    expect(res.status).toBe(400);
  });

  test('stock adjustment cannot make stock negative (422)', async () => {
    const res = await api().patch(`/api/products/${product._id}/stock`).set(auth(seller.token)).send({ change: -1000, reason: 'adjustment' });
    expect(res.status).toBe(422);
  });

  test('restock is recorded in stock history', async () => {
    await api().patch(`/api/products/${product._id}/stock`).set(auth(seller.token)).send({ change: 5 }).expect(200);
    const res = await api().get(`/api/products/${product._id}/stock-history`).set(auth(seller.token));
    expect(res.body.data[0]).toMatchObject({ change: 5, reason: 'restock', stockAfter: 15 });
  });

  test('non-existent product returns 404', async () => {
    const res = await api().get('/api/products/64b7f0000000000000000000');
    expect(res.status).toBe(404);
  });

  test('admin-only category creation; duplicates return 409', async () => {
    expect((await api().post('/api/categories').set(auth(seller.token)).send({ name: 'Toys' })).status).toBe(403);
    expect((await api().post('/api/categories').set(auth(admin.token)).send({ name: 'Toys' })).status).toBe(201);
    expect((await api().post('/api/categories').set(auth(admin.token)).send({ name: 'Toys' })).status).toBe(409);
  });

  test('category in use cannot be deleted (409)', async () => {
    const res = await api().delete(`/api/categories/${category._id}`).set(auth(admin.token));
    expect(res.status).toBe(409);
  });
});
