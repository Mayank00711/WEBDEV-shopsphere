/* eslint-disable no-console */
// Seeds a demo dataset: 1 admin, 2 sellers, 3 customers, 6 categories, 30 products,
// 2 coupons and ~45 historical orders spread over the last 60 days (so reports have data).
// Usage: npm run seed            (wipes and re-creates the database in MONGO_URI)
const mongoose = require('mongoose');
const config = require('../src/config/env');
const { connectDB } = require('../src/config/db');
const User = require('../src/models/User');
const Category = require('../src/models/Category');
const Product = require('../src/models/Product');
const Cart = require('../src/models/Cart');
const Order = require('../src/models/Order');
const Coupon = require('../src/models/Coupon');
const Notification = require('../src/models/Notification');
const StockMovement = require('../src/models/StockMovement');

const PASSWORD = 'Password@123';

const users = [
  { name: 'Platform Admin', email: 'admin@shopsphere.dev', role: 'admin' },
  { name: 'Rohan Mehta', email: 'seller.tech@shopsphere.dev', role: 'seller', storeName: 'TechNova' },
  { name: 'Ananya Rao', email: 'seller.style@shopsphere.dev', role: 'seller', storeName: 'Urban Loom' },
  { name: 'Aarav Sharma', email: 'aarav@shopsphere.dev', role: 'customer', phone: '9876543210' },
  { name: 'Priya Verma', email: 'priya@shopsphere.dev', role: 'customer', phone: '9123456780' },
  { name: 'Kabir Singh', email: 'kabir@shopsphere.dev', role: 'customer', phone: '9988776655' },
];

const categories = [
  { name: 'Electronics', description: 'Audio, wearables and smart devices' },
  { name: 'Computers', description: 'Laptops, keyboards and accessories' },
  { name: 'Fashion', description: 'Apparel, footwear and accessories' },
  { name: 'Home & Kitchen', description: 'Cookware, decor and essentials' },
  { name: 'Books', description: 'Engineering, fiction and self-help' },
  { name: 'Sports & Fitness', description: 'Gear for training and the outdoors' },
];

// [name, category, sellerKey, price, stock, threshold, description]
const products = [
  ['Aura ANC Wireless Headphones', 'Electronics', 'tech', 7999, 40, 5, 'Over-ear headphones with hybrid active noise cancellation, 40-hour battery and USB-C fast charge.'],
  ['Pulse Smartwatch Series 3', 'Electronics', 'tech', 4499, 25, 5, 'AMOLED display, SpO2 and heart-rate tracking, GPS and 7-day battery life.'],
  ['Echo Buds Pro', 'Electronics', 'tech', 2999, 60, 8, 'True wireless earbuds with low-latency gaming mode and IPX5 water resistance.'],
  ['Lumen 4K Action Camera', 'Electronics', 'tech', 12499, 12, 3, 'Stabilised 4K60 video, waterproof to 10 m without a case.'],
  ['Orbit Bluetooth Speaker', 'Electronics', 'tech', 3499, 4, 5, '360° sound, 20-hour battery and party pairing for up to 100 speakers.'],
  ['Volt 20000mAh Power Bank', 'Electronics', 'tech', 1799, 80, 10, '65 W PD output, charges a laptop, phone and earbuds at once.'],
  ['Nimbus 14 Ultrabook', 'Computers', 'tech', 64999, 8, 2, '14" 2.8K display, 16 GB RAM, 512 GB SSD and an all-day battery in 1.2 kg.'],
  ['Strata Mechanical Keyboard', 'Computers', 'tech', 5499, 30, 5, 'Hot-swappable 75% layout with gasket mount and PBT keycaps.'],
  ['Glide Wireless Mouse', 'Computers', 'tech', 1499, 3, 5, 'Silent clicks, 4000 DPI sensor and multi-device switching.'],
  ['Vista 27" QHD Monitor', 'Computers', 'tech', 18999, 10, 3, 'IPS panel, 165 Hz, 99% sRGB and a height-adjustable stand.'],
  ['Dock Pro USB-C Hub', 'Computers', 'tech', 2799, 45, 6, '8-in-1 hub with 4K HDMI, 100 W pass-through and SD card reader.'],
  ['Classic Oxford Shirt', 'Fashion', 'style', 1599, 70, 10, '100% cotton oxford weave, tailored fit, in sky blue.'],
  ['Everyday Denim Jacket', 'Fashion', 'style', 2899, 22, 5, 'Mid-wash rigid denim with brass buttons.'],
  ['Stride Running Shoes', 'Fashion', 'style', 3999, 35, 6, 'Responsive foam midsole and breathable knit upper.'],
  ['Heritage Leather Watch', 'Fashion', 'style', 5999, 2, 4, 'Sapphire crystal, Japanese quartz movement and Italian leather strap.'],
  ['Voyager Canvas Backpack', 'Fashion', 'style', 2199, 50, 8, 'Water-resistant waxed canvas with a padded 15" laptop sleeve.'],
  ['Polar Aviator Sunglasses', 'Fashion', 'style', 1899, 28, 5, 'Polarised lenses with UV400 protection.'],
  ['Brew Master Pour-Over Kit', 'Home & Kitchen', 'style', 2499, 18, 4, 'Glass dripper, gooseneck kettle and reusable steel filter.'],
  ['Cast Iron Skillet 26cm', 'Home & Kitchen', 'style', 1899, 26, 5, 'Pre-seasoned, oven safe and induction ready.'],
  ['Ceramic Dinner Set (16 pc)', 'Home & Kitchen', 'style', 3299, 14, 3, 'Stoneware plates and bowls with a matte glaze.'],
  ['Aroma Diffuser Lamp', 'Home & Kitchen', 'style', 1299, 40, 6, 'Ultrasonic diffuser with warm ambient light.'],
  ['Clean Code', 'Books', 'tech', 699, 55, 8, 'Robert C. Martin\'s handbook of agile software craftsmanship.'],
  ['Designing Data-Intensive Applications', 'Books', 'tech', 1299, 32, 5, 'Martin Kleppmann on the ideas behind reliable, scalable systems.'],
  ['Node.js Design Patterns', 'Books', 'tech', 999, 20, 5, 'Patterns for building production-grade Node.js applications.'],
  ['Atomic Habits', 'Books', 'style', 499, 90, 10, 'James Clear\'s guide to building good habits and breaking bad ones.'],
  ['Pro Yoga Mat 6mm', 'Sports & Fitness', 'style', 1199, 45, 8, 'Non-slip TPE mat with alignment lines and carry strap.'],
  ['Adjustable Dumbbells 20kg', 'Sports & Fitness', 'tech', 6999, 9, 3, 'Quick-dial weight selection from 2.5 to 20 kg.'],
  ['Trail Hydration Bottle 1L', 'Sports & Fitness', 'style', 799, 65, 10, 'Insulated steel, keeps drinks cold for 24 hours.'],
  ['Cadence Cycling Helmet', 'Sports & Fitness', 'tech', 2499, 1, 3, 'Lightweight in-mould shell with MIPS protection.'],
  ['Resistance Band Set', 'Sports & Fitness', 'style', 899, 0, 5, 'Five latex bands from 5 to 25 kg with door anchor.'],
];

const addresses = {
  'aarav@shopsphere.dev': { fullName: 'Aarav Sharma', line1: '12 MG Road', city: 'Gurugram', state: 'Haryana', postalCode: '122001', phone: '9876543210' },
  'priya@shopsphere.dev': { fullName: 'Priya Verma', line1: '45 Park Street', city: 'Kolkata', state: 'West Bengal', postalCode: '700016', phone: '9123456780' },
  'kabir@shopsphere.dev': { fullName: 'Kabir Singh', line1: '8 Residency Road', city: 'Bengaluru', state: 'Karnataka', postalCode: '560025', phone: '9988776655' },
};

// Deterministic pseudo-random generator so the seed data is identical on every run.
let s = 42;
const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const round2 = (n) => Math.round(n * 100) / 100;

async function seed() {
  await connectDB();
  console.log(`[seed] resetting ${mongoose.connection.name}`);
  await mongoose.connection.dropDatabase();
  await Promise.all([User, Category, Product, Cart, Order, Coupon, Notification, StockMovement].map((m) => m.syncIndexes()));

  const createdUsers = {};
  for (const u of users) {
    createdUsers[u.email] = await User.create({ ...u, password: PASSWORD, address: addresses[u.email] && { line1: addresses[u.email].line1, city: addresses[u.email].city, state: addresses[u.email].state, postalCode: addresses[u.email].postalCode } });
  }
  const sellers = { tech: createdUsers['seller.tech@shopsphere.dev'], style: createdUsers['seller.style@shopsphere.dev'] };
  const customers = users.filter((u) => u.role === 'customer').map((u) => createdUsers[u.email]);
  const admin = createdUsers['admin@shopsphere.dev'];

  const cats = {};
  for (const c of categories) cats[c.name] = await Category.create(c);

  const prods = [];
  let i = 0;
  for (const [name, cat, sellerKey, price, stock, threshold, description] of products) {
    i += 1;
    prods.push(await Product.create({
      name, description, price, stock, lowStockThreshold: threshold,
      category: cats[cat]._id, seller: sellers[sellerKey]._id, sku: `SKU-${String(i).padStart(4, '0')}`,
      createdAt: new Date(Date.now() - (60 - i) * 86400000),
    }));
  }
  await StockMovement.insertMany(prods.map((p) => ({ product: p._id, change: p.stock, reason: 'restock', by: p.seller, stockAfter: p.stock })));

  await Coupon.create([
    { code: 'WELCOME10', type: 'percent', value: 10, maxDiscount: 500, minOrderValue: 999, expiresAt: new Date(Date.now() + 365 * 86400000) },
    { code: 'FLAT250', type: 'flat', value: 250, minOrderValue: 2000, usageLimit: 100, expiresAt: new Date(Date.now() + 90 * 86400000) },
    { code: 'EXPIRED5', type: 'percent', value: 5, expiresAt: new Date(Date.now() - 86400000) },
  ]);

  // Historical orders. Each order uses one seller so seller status updates are demoable.
  const statuses = ['delivered', 'delivered', 'delivered', 'shipped', 'confirmed', 'pending', 'cancelled'];
  const orders = [];
  for (let n = 0; n < 45; n += 1) {
    const customer = pick(customers);
    const sellerKey = rand() < 0.55 ? 'tech' : 'style';
    const pool = prods.filter((p) => p.seller.equals(sellers[sellerKey]._id) && p.price < 30000);
    const count = 1 + Math.floor(rand() * 3);
    const chosen = [...new Set(Array.from({ length: count }, () => pick(pool)))];
    const items = chosen.map((p) => {
      const quantity = 1 + Math.floor(rand() * 2);
      return { product: p._id, seller: p.seller, name: p.name, unitPrice: p.price, quantity, lineTotal: p.price * quantity };
    });
    const subtotal = round2(items.reduce((t, it) => t + it.lineTotal, 0));
    const shippingFee = subtotal >= 999 ? 0 : 49;
    const status = pick(statuses);
    const createdAt = new Date(Date.now() - Math.floor(rand() * 60) * 86400000 - Math.floor(rand() * 86400000));
    const method = pick(['SIMULATED_CARD', 'SIMULATED_UPI', 'COD']);
    const paid = method !== 'COD' || status === 'delivered';
    const flow = ['pending', 'confirmed', 'shipped', 'delivered'];
    const history = status === 'cancelled' ? ['pending', 'cancelled'] : flow.slice(0, flow.indexOf(status) + 1);
    orders.push({
      orderNumber: `ORD-SEED-${String(n + 1).padStart(4, '0')}`,
      customer: customer._id,
      items,
      subtotal,
      shippingFee,
      total: subtotal + shippingFee,
      shippingAddress: addresses[customer.email],
      status,
      statusHistory: history.map((st, k) => ({ status: st, changedBy: k === 0 ? customer._id : sellers[sellerKey]._id, at: new Date(createdAt.getTime() + k * 86400000) })),
      payment: {
        method, simulated: true,
        status: status === 'cancelled' && method !== 'COD' ? 'refunded' : paid ? 'paid' : 'pending',
        transactionId: method === 'COD' ? undefined : `SIM-SEED${n}`,
        paidAt: paid ? createdAt : undefined,
      },
      createdAt,
      updatedAt: createdAt,
    });
  }
  await Order.insertMany(orders, { timestamps: false });

  // A ready-made cart for the demo customer.
  await Cart.create({ user: customers[0]._id, items: [{ product: prods[0]._id, quantity: 1 }, { product: prods[21]._id, quantity: 2 }] });

  await Notification.create({ user: admin._id, type: 'stock.low', title: 'Low stock alert', message: 'Several products are below their stock threshold.', data: {} });

  console.log('[seed] done');
  console.table(users.map((u) => ({ role: u.role, email: u.email, password: PASSWORD })));
  console.log(`[seed] ${prods.length} products, ${categories.length} categories, ${orders.length} orders, 3 coupons (WELCOME10, FLAT250, EXPIRED5)`);
  await mongoose.disconnect();
}

seed().catch(async (err) => {
  console.error('[seed] failed', err);
  await mongoose.disconnect();
  process.exit(1);
});

module.exports = { PASSWORD };
