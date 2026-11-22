process.env.NODE_ENV = 'test';
const http = require('http');
const mongoose = require('mongoose');
const request = require('supertest');
const { connectDB } = require('../src/config/db');
const app = require('../src/app');
const { initSocket, closeSocket } = require('../src/sockets');
const { registerListeners } = require('../src/events/listeners');
const { eventBus } = require('../src/events/eventBus');
const User = require('../src/models/User');
const Category = require('../src/models/Category');
const Product = require('../src/models/Product');

const PASSWORD = 'Password@123';
let server;

async function setup() {
  await connectDB();
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  server = http.createServer(app);
  initSocket(server);
  eventBus.removeAllListeners();
  registerListeners();
  await new Promise((r) => server.listen(0, r));
  return server;
}

async function teardown() {
  closeSocket();
  await new Promise((r) => server.close(r));
  await mongoose.disconnect();
}

const api = () => request(app);
const port = () => server.address().port;

async function createUser(role, overrides = {}) {
  const n = Math.random().toString(36).slice(2, 8);
  const user = await User.create({
    name: `${role} ${n}`,
    email: `${role}.${n}@test.dev`,
    password: PASSWORD,
    role,
    ...(role === 'seller' && { storeName: `Store ${n}` }),
    ...overrides,
  });
  const res = await api().post('/api/auth/login').send({ email: user.email, password: PASSWORD });
  return { user, token: res.body.data.accessToken, refreshToken: res.body.data.refreshToken };
}

async function createCatalog(seller) {
  const category = await Category.create({ name: `Cat ${Math.random().toString(36).slice(2, 7)}` });
  const product = await Product.create({ name: 'Test Headphones', description: 'Noise cancelling', price: 1000, stock: 10, lowStockThreshold: 3, category: category._id, seller: seller._id });
  return { category, product };
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const address = { fullName: 'Test User', line1: '1 Test Street', city: 'Delhi', state: 'Delhi', postalCode: '110001', phone: '9999999999' };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { setup, teardown, api, port, createUser, createCatalog, auth, address, wait, PASSWORD };
