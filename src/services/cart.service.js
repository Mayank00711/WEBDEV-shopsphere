const Cart = require('../models/Cart');
const Product = require('../models/Product');
const ApiError = require('../utils/ApiError');
const { round2 } = require('./coupon.service');

const FREE_SHIPPING_OVER = 999;
const SHIPPING_FEE = 49;

async function getOrCreate(userId) {
  return (await Cart.findOne({ user: userId })) || Cart.create({ user: userId, items: [] });
}

// Builds the cart view with LIVE prices from the database. Client-sent prices are never used.
async function priceCart(cart) {
  const ids = cart.items.map((i) => i.product);
  const products = await Product.find({ _id: { $in: ids } })
    .populate('seller', 'name storeName')
    .populate('category', 'name slug');
  const byId = new Map(products.map((p) => [p._id.toString(), p]));

  const items = [];
  const issues = [];
  for (const item of cart.items) {
    const p = byId.get(item.product.toString());
    if (!p || !p.isActive) {
      issues.push({ product: item.product, issue: 'Product is no longer available' });
      continue;
    }
    if (p.stock < item.quantity) {
      issues.push({ product: p._id, issue: `Only ${p.stock} left in stock`, available: p.stock, requested: item.quantity });
    }
    items.push({
      product: { _id: p._id, name: p.name, images: p.images, stock: p.stock, seller: p.seller, category: p.category },
      quantity: item.quantity,
      unitPrice: p.price,
      lineTotal: round2(p.price * item.quantity),
    });
  }
  const subtotal = round2(items.reduce((s, i) => s + i.lineTotal, 0));
  const shippingFee = subtotal === 0 || subtotal >= FREE_SHIPPING_OVER ? 0 : SHIPPING_FEE;
  return {
    _id: cart._id,
    items,
    itemCount: items.reduce((s, i) => s + i.quantity, 0),
    subtotal,
    shippingFee,
    total: round2(subtotal + shippingFee),
    issues,
    updatedAt: cart.updatedAt,
  };
}

async function assertPurchasable(productId, quantity) {
  const product = await Product.findById(productId);
  if (!product || !product.isActive) throw ApiError.notFound('Product not found');
  if (product.stock < quantity) {
    throw ApiError.unprocessable(`Only ${product.stock} unit(s) of "${product.name}" available`, [
      { product: product._id, available: product.stock, requested: quantity },
    ]);
  }
  return product;
}

async function addItem(userId, productId, quantity) {
  const cart = await getOrCreate(userId);
  const existing = cart.items.find((i) => i.product.toString() === productId);
  const newQty = (existing ? existing.quantity : 0) + quantity;
  if (newQty > 100) throw ApiError.unprocessable('Maximum quantity per product is 100');
  await assertPurchasable(productId, newQty);
  if (existing) existing.quantity = newQty;
  else cart.items.push({ product: productId, quantity });
  await cart.save();
  return priceCart(cart);
}

async function updateItem(userId, productId, quantity) {
  const cart = await getOrCreate(userId);
  const existing = cart.items.find((i) => i.product.toString() === productId);
  if (!existing) throw ApiError.notFound('This product is not in your cart');
  await assertPurchasable(productId, quantity);
  existing.quantity = quantity;
  await cart.save();
  return priceCart(cart);
}

async function removeItem(userId, productId) {
  const cart = await getOrCreate(userId);
  const before = cart.items.length;
  cart.items = cart.items.filter((i) => i.product.toString() !== productId);
  if (cart.items.length === before) throw ApiError.notFound('This product is not in your cart');
  await cart.save();
  return priceCart(cart);
}

async function clear(userId) {
  const cart = await getOrCreate(userId);
  cart.items = [];
  await cart.save();
  return priceCart(cart);
}

module.exports = { getOrCreate, priceCart, addItem, updateItem, removeItem, clear, FREE_SHIPPING_OVER, SHIPPING_FEE };
