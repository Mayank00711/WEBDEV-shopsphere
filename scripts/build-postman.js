// Generates the Postman collection in /postman from a compact definition.
// Run: node scripts/build-postman.js   (then: npm run test:postman)
const fs = require('fs');
const path = require('path');

const pm = {
  status: (code) => `pm.test('Status is ${code}', () => pm.response.to.have.status(${code}));`,
  json: `const body = pm.response.json();`,
  success: (b) => `pm.test('success is ${b}', () => pm.expect(pm.response.json().success).to.eql(${b}));`,
  set: (name, expr) => `pm.collectionVariables.set('${name}', ${expr});`,
};

function req(name, method, url, { body, token, tests = [], pre, description } = {}) {
  const headers = [{ key: 'Content-Type', value: 'application/json' }];
  if (token) headers.push({ key: 'Authorization', value: `Bearer {{${token}}}` });
  const [pathPart, query] = url.split('?');
  const item = {
    name,
    request: {
      method,
      header: headers,
      url: {
        raw: `{{baseUrl}}${url}`,
        host: ['{{baseUrl}}'],
        path: pathPart.split('/').filter(Boolean),
        ...(query && { query: query.split('&').map((kv) => { const [key, value] = kv.split('='); return { key, value }; }) }),
      },
      ...(description && { description }),
    },
    event: [{ listen: 'test', script: { type: 'text/javascript', exec: tests.join('\n').split('\n') } }],
  };
  if (body) item.request.body = { mode: 'raw', raw: JSON.stringify(body, null, 2), options: { raw: { language: 'json' } } };
  if (pre) item.event.push({ listen: 'prerequest', script: { type: 'text/javascript', exec: pre.split('\n') } });
  return item;
}

const folder = (name, description, item) => ({ name, description, item });
const PASSWORD = 'Password@123';
const address = { fullName: 'Aarav Sharma', line1: '12 MG Road', city: 'Gurugram', state: 'Haryana', postalCode: '122001', phone: '9876543210' };

const login = (who, email, varName) => req(`Login as ${who}`, 'POST', '/api/auth/login', {
  body: { email, password: PASSWORD },
  tests: [pm.status(200), pm.json, pm.set(varName, 'body.data.accessToken'), pm.set(`${varName}Refresh`, 'body.data.refreshToken'), pm.set(`${varName}Id`, 'body.data.user._id'),
    `pm.test('returns access and refresh tokens', () => { pm.expect(body.data.accessToken).to.be.a('string'); pm.expect(body.data.refreshToken).to.be.a('string'); });`,
    `pm.test('password is never returned', () => pm.expect(body.data.user.password).to.be.undefined);`],
});

const collection = {
  info: {
    name: 'ShopSphere – E-Commerce & Inventory API',
    description: 'Backend Development capstone (Project 4). Run `npm run seed` first, then run the whole collection in order (Collection Runner or `npm run test:postman`). Each request has assertions covering success, validation-failure, unauthorized, forbidden, not-found, conflict and business-rule cases.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  variable: [{ key: 'baseUrl', value: 'http://localhost:5000' }],
  item: [
    folder('0. Health', 'Server and database status', [
      req('Health check', 'GET', '/api/health', { tests: [pm.status(200), `pm.test('db connected', () => pm.expect(pm.response.json().data.db).to.eql('connected'));`] }),
    ]),
    folder('1. Auth', 'Registration, login, JWT access/refresh tokens', [
      login('Admin', 'admin@shopsphere.dev', 'adminToken'),
      login('Seller (TechNova)', 'seller.tech@shopsphere.dev', 'sellerToken'),
      login('Seller (Urban Loom)', 'seller.style@shopsphere.dev', 'seller2Token'),
      login('Customer (Aarav)', 'aarav@shopsphere.dev', 'customerToken'),
      login('Customer (Priya)', 'priya@shopsphere.dev', 'customer2Token'),
      req('Register new customer', 'POST', '/api/auth/register', {
        pre: `pm.collectionVariables.set('newEmail', 'user' + Date.now() + '@example.com');`,
        body: { name: 'Neha Gupta', email: '{{newEmail}}', password: 'Secret123', phone: '9000000000' },
        tests: [pm.status(201), pm.json, `pm.test('role defaults to customer', () => pm.expect(body.data.user.role).to.eql('customer'));`],
      }),
      req('Register – duplicate email (409)', 'POST', '/api/auth/register', {
        body: { name: 'Neha Gupta', email: '{{newEmail}}', password: 'Secret123' }, tests: [pm.status(409), pm.success(false)],
      }),
      req('Register – validation failure (400)', 'POST', '/api/auth/register', {
        body: { name: 'N', email: 'not-an-email', password: '123' },
        tests: [pm.status(400), pm.json, `pm.test('lists invalid fields', () => pm.expect(body.errors.map(e => e.field)).to.include.members(['name','email','password']));`],
      }),
      req('Register – cannot self-register as admin (400)', 'POST', '/api/auth/register', {
        body: { name: 'Hacker', email: 'hacker@example.com', password: 'Secret123', role: 'admin' }, tests: [pm.status(400)],
      }),
      req('Login – wrong password (401)', 'POST', '/api/auth/login', {
        body: { email: 'aarav@shopsphere.dev', password: 'WrongPass1' }, tests: [pm.status(401), pm.success(false)],
      }),
      req('Refresh access token (rotation)', 'POST', '/api/auth/refresh', {
        body: { refreshToken: '{{customerTokenRefresh}}' },
        tests: [pm.status(200), pm.json, `pm.test('new refresh token issued', () => pm.expect(body.data.refreshToken).to.not.eql(pm.collectionVariables.get('customerTokenRefresh')));`,
          pm.set('oldRefresh', "pm.collectionVariables.get('customerTokenRefresh')"), pm.set('customerToken', 'body.data.accessToken'), pm.set('customerTokenRefresh', 'body.data.refreshToken')],
      }),
      req('Refresh – invalid token (401)', 'POST', '/api/auth/refresh', { body: { refreshToken: 'not-a-real-token' }, tests: [pm.status(401)] }),
    ]),
    folder('2. Users', 'Profile and admin user management', [
      req('Get my profile', 'GET', '/api/users/me', { token: 'customerToken', tests: [pm.status(200), `pm.test('is Aarav', () => pm.expect(pm.response.json().data.email).to.eql('aarav@shopsphere.dev'));`] }),
      req('Get my profile – no token (401)', 'GET', '/api/users/me', { tests: [pm.status(401)] }),
      req('Update my profile (role field is ignored)', 'PATCH', '/api/users/me', {
        token: 'customerToken', body: { phone: '9876543210', role: 'admin', address: { line1: '12 MG Road', city: 'Gurugram', state: 'Haryana', postalCode: '122001' } },
        tests: [pm.status(200), `pm.test('role unchanged', () => pm.expect(pm.response.json().data.role).to.eql('customer'));`],
      }),
      req('Admin – list customers (paginated)', 'GET', '/api/users?role=customer&page=1&limit=5', {
        token: 'adminToken', tests: [pm.status(200), `pm.test('has pagination meta', () => pm.expect(pm.response.json().meta).to.have.keys('total','page','limit','totalPages'));`],
      }),
      req('Customer – list users (403)', 'GET', '/api/users', { token: 'customerToken', tests: [pm.status(403)] }),
      req('Admin – get user by id', 'GET', '/api/users/{{customer2TokenId}}', { token: 'adminToken', tests: [pm.status(200)] }),
      req('Admin – user not found (404)', 'GET', '/api/users/64b7f0000000000000000000', { token: 'adminToken', tests: [pm.status(404)] }),
      req('Admin – malformed id (400)', 'GET', '/api/users/123', { token: 'adminToken', tests: [pm.status(400)] }),
    ]),
    folder('3. Categories', 'Admin-managed product categories', [
      req('List categories (public)', 'GET', '/api/categories', { tests: [pm.status(200), pm.json, pm.set('categoryId', 'body.data[0]._id'), `pm.test('includes product counts', () => pm.expect(body.data[0]).to.have.property('productCount'));`] }),
      req('Admin – create category', 'POST', '/api/categories', {
        pre: `pm.collectionVariables.set('catName', 'Toys ' + Date.now());`,
        token: 'adminToken', body: { name: '{{catName}}', description: 'Games and toys' }, tests: [pm.status(201), pm.json, pm.set('newCategoryId', 'body.data._id')],
      }),
      req('Admin – duplicate category (409)', 'POST', '/api/categories', { token: 'adminToken', body: { name: '{{catName}}' }, tests: [pm.status(409)] }),
      req('Seller – create category (403)', 'POST', '/api/categories', { token: 'sellerToken', body: { name: 'Nope' }, tests: [pm.status(403)] }),
      req('Admin – update category', 'PATCH', '/api/categories/{{newCategoryId}}', { token: 'adminToken', body: { description: 'Updated' }, tests: [pm.status(200)] }),
      req('Admin – delete category in use (409)', 'DELETE', '/api/categories/{{categoryId}}', { token: 'adminToken', tests: [pm.status(409)] }),
      req('Admin – delete category', 'DELETE', '/api/categories/{{newCategoryId}}', { token: 'adminToken', tests: [pm.status(200)] }),
    ]),
    folder('4. Products & Inventory', 'Catalogue search/filter/sort/pagination and seller inventory', [
      req('List products (page 1, 6 per page, cheapest first)', 'GET', '/api/products?page=1&limit=6&sort=price', {
        tests: [pm.status(200), pm.json, `pm.test('sorted by price', () => { const p = body.data.map(x => x.price); pm.expect(p).to.eql([...p].sort((a,b)=>a-b)); });`],
      }),
      req('Search products (text index)', 'GET', '/api/products?search=headphones', { tests: [pm.status(200), `pm.test('found headphones', () => pm.expect(pm.response.json().data[0].name).to.match(/Headphones/));`] }),
      req('Filter by seller, in stock', 'GET', '/api/products?seller={{sellerTokenId}}&inStock=true&minPrice=500&maxPrice=10000&sort=-price', {
        tests: [pm.status(200), pm.json, pm.set('productId', 'body.data[0]._id'), pm.set('productStock', 'body.data[0].stock'),
          `pm.test('all from TechNova', () => body.data.forEach(p => pm.expect(p.seller._id).to.eql(pm.collectionVariables.get('sellerTokenId'))));`],
      }),
      req('Filter – invalid price range (400)', 'GET', '/api/products?minPrice=900&maxPrice=100', { tests: [pm.status(400)] }),
      req('Get product by id', 'GET', '/api/products/{{productId}}', { tests: [pm.status(200)] }),
      req('Get product – not found (404)', 'GET', '/api/products/64b7f0000000000000000000', { tests: [pm.status(404)] }),
      req('Seller – create product', 'POST', '/api/products', {
        token: 'sellerToken', body: { name: 'Nova Smart Lamp', description: 'Wi-Fi RGB lamp', price: 1999, stock: 6, lowStockThreshold: 5, category: '{{categoryId}}' },
        tests: [pm.status(201), pm.json, pm.set('newProductId', 'body.data._id')],
      }),
      req('Seller – create product, validation failure (400)', 'POST', '/api/products', {
        token: 'sellerToken', body: { name: 'X', price: -10, stock: 1.5 }, tests: [pm.status(400)],
      }),
      req('Customer – create product (403)', 'POST', '/api/products', {
        token: 'customerToken', body: { name: 'Fake', price: 10, stock: 1, category: '{{categoryId}}' }, tests: [pm.status(403)],
      }),
      req('No token – create product (401)', 'POST', '/api/products', { body: { name: 'Fake', price: 10, stock: 1, category: '{{categoryId}}' }, tests: [pm.status(401)] }),
      req('Seller – update own product', 'PATCH', '/api/products/{{newProductId}}', { token: 'sellerToken', body: { price: 1799 }, tests: [pm.status(200)] }),
      req("Other seller – update someone else's product (403)", 'PATCH', '/api/products/{{newProductId}}', { token: 'seller2Token', body: { price: 1 }, tests: [pm.status(403)] }),
      req('Seller – restock product', 'PATCH', '/api/products/{{newProductId}}/stock', {
        token: 'sellerToken', body: { change: 10, reason: 'restock' }, tests: [pm.status(200), `pm.test('stock is 16', () => pm.expect(pm.response.json().data.stock).to.eql(16));`],
      }),
      req('Seller – remove more stock than available (422)', 'PATCH', '/api/products/{{newProductId}}/stock', {
        token: 'sellerToken', body: { change: -1000, reason: 'adjustment' }, tests: [pm.status(422)],
      }),
      req('Seller – stock history (audit trail)', 'GET', '/api/products/{{newProductId}}/stock-history', { token: 'sellerToken', tests: [pm.status(200)] }),
      req('Seller – my inventory', 'GET', '/api/products/mine?limit=50', { token: 'sellerToken', tests: [pm.status(200)] }),
      req('Seller – delete product', 'DELETE', '/api/products/{{newProductId}}', { token: 'sellerToken', tests: [pm.status(200)] }),
    ]),
    folder('5. Cart', 'Server-priced shopping cart', [
      req('Clear cart', 'DELETE', '/api/cart', { token: 'customerToken', tests: [pm.status(200)] }),
      req('Add item to cart (client price ignored)', 'POST', '/api/cart/items', {
        token: 'customerToken', body: { productId: '{{productId}}', quantity: 1, price: 1 },
        tests: [pm.status(200), pm.json, `pm.test('server price used', () => pm.expect(body.data.items[0].unitPrice).to.be.above(1));`],
      }),
      req('Add item – quantity above stock (422)', 'POST', '/api/cart/items', { token: 'customerToken', body: { productId: '{{productId}}', quantity: 99 }, tests: [pm.status(422)] }),
      req('Add item – invalid product id (400)', 'POST', '/api/cart/items', { token: 'customerToken', body: { productId: 'abc', quantity: 1 }, tests: [pm.status(400)] }),
      req('Update quantity', 'PATCH', '/api/cart/items/{{productId}}', { token: 'customerToken', body: { quantity: 2 }, tests: [pm.status(200), `pm.test('qty 2', () => pm.expect(pm.response.json().data.items[0].quantity).to.eql(2));`] }),
      req('Get cart with totals', 'GET', '/api/cart', { token: 'customerToken', tests: [pm.status(200), pm.json, `pm.test('total = subtotal + shipping', () => pm.expect(body.data.total).to.eql(body.data.subtotal + body.data.shippingFee));`] }),
      req('Seller – access cart (403)', 'GET', '/api/cart', { token: 'sellerToken', tests: [pm.status(403)] }),
    ]),
    folder('6. Coupons', 'Discount codes (advanced feature)', [
      req('Apply WELCOME10 to cart', 'POST', '/api/coupons/apply', { token: 'customerToken', body: { code: 'WELCOME10' }, tests: [pm.status(200)] }),
      req('Apply expired coupon (422)', 'POST', '/api/coupons/apply', { token: 'customerToken', body: { code: 'EXPIRED5' }, tests: [pm.status(422)] }),
      req('Admin – list coupons', 'GET', '/api/coupons', { token: 'adminToken', tests: [pm.status(200)] }),
      req('Customer – list coupons (403)', 'GET', '/api/coupons', { token: 'customerToken', tests: [pm.status(403)] }),
    ]),
    folder('7. Orders', 'Checkout, atomic stock, status transitions, access control', [
      req('Checkout (simulated payment)', 'POST', '/api/orders', {
        token: 'customerToken', body: { shippingAddress: address, paymentMethod: 'SIMULATED_CARD', couponCode: 'WELCOME10' },
        tests: [pm.status(201), pm.json, pm.set('orderId', 'body.data._id'),
          `pm.test('payment is marked simulated', () => pm.expect(body.data.payment.simulated).to.eql(true));`,
          `pm.test('total computed on server', () => pm.expect(body.data.total).to.eql(Math.round((body.data.subtotal - body.data.discount + body.data.shippingFee)*100)/100));`],
      }),
      req('Stock was decremented atomically', 'GET', '/api/products/{{productId}}', {
        tests: [pm.status(200), `pm.test('stock reduced by 2', () => pm.expect(pm.response.json().data.stock).to.eql(Number(pm.collectionVariables.get('productStock')) - 2));`],
      }),
      req('Checkout – empty cart (422)', 'POST', '/api/orders', { token: 'customerToken', body: { shippingAddress: address, paymentMethod: 'COD' }, tests: [pm.status(422)] }),
      req('Checkout – missing address (400)', 'POST', '/api/orders', { token: 'customerToken', body: { paymentMethod: 'COD' }, tests: [pm.status(400)] }),
      req('Customer – my orders', 'GET', '/api/orders?page=1&limit=5', { token: 'customerToken', tests: [pm.status(200)] }),
      req('Customer – get my order', 'GET', '/api/orders/{{orderId}}', { token: 'customerToken', tests: [pm.status(200)] }),
      req("Other customer – get someone else's order (404)", 'GET', '/api/orders/{{orderId}}', { token: 'customer2Token', tests: [pm.status(404)] }),
      req('Seller – invalid transition pending → delivered (422)', 'PATCH', '/api/orders/{{orderId}}/status', { token: 'sellerToken', body: { status: 'delivered' }, tests: [pm.status(422)] }),
      req('Customer – mark shipped (403)', 'PATCH', '/api/orders/{{orderId}}/status', { token: 'customerToken', body: { status: 'shipped' }, tests: [pm.status(403)] }),
      req('Seller – confirm order', 'PATCH', '/api/orders/{{orderId}}/status', { token: 'sellerToken', body: { status: 'confirmed', note: 'Packed' }, tests: [pm.status(200)] }),
      req('Other seller – update order not theirs (404)', 'PATCH', '/api/orders/{{orderId}}/status', { token: 'seller2Token', body: { status: 'shipped' }, tests: [pm.status(404)] }),
      req('Customer – cancel confirmed order (stock restored)', 'PATCH', '/api/orders/{{orderId}}/status', {
        token: 'customerToken', body: { status: 'cancelled', note: 'Changed my mind' }, tests: [pm.status(200), `pm.test('refunded', () => pm.expect(pm.response.json().data.payment.status).to.eql('refunded'));`],
      }),
      req('Stock restored after cancellation', 'GET', '/api/products/{{productId}}', {
        tests: [`pm.test('stock back to original', () => pm.expect(pm.response.json().data.stock).to.eql(Number(pm.collectionVariables.get('productStock'))));`],
      }),
      req('Customer – cancel again (409)', 'PATCH', '/api/orders/{{orderId}}/status', { token: 'customerToken', body: { status: 'cancelled' }, tests: [pm.status(409)] }),
      req('Seller – orders containing my products', 'GET', '/api/orders?status=delivered', { token: 'sellerToken', tests: [pm.status(200)] }),
      req('Admin – all orders', 'GET', '/api/orders?limit=10', { token: 'adminToken', tests: [pm.status(200)] }),
    ]),
    folder('8. Reports (Aggregation)', 'MongoDB aggregation pipelines', [
      req('Admin – sales summary by month', 'GET', '/api/reports/sales?groupBy=month', { token: 'adminToken', tests: [pm.status(200), `pm.test('has totals', () => pm.expect(pm.response.json().data.totals.revenue).to.be.above(0));`] }),
      req('Seller – daily sales (own products only)', 'GET', '/api/reports/sales?groupBy=day', { token: 'sellerToken', tests: [pm.status(200)] }),
      req('Top 5 best-selling products', 'GET', '/api/reports/top-products?limit=5', { token: 'adminToken', tests: [pm.status(200)] }),
      req('Category-wise sales', 'GET', '/api/reports/category-sales', { token: 'adminToken', tests: [pm.status(200)] }),
      req('Inventory summary', 'GET', '/api/reports/inventory', { token: 'adminToken', tests: [pm.status(200)] }),
      req('Low-stock products', 'GET', '/api/reports/low-stock', { token: 'sellerToken', tests: [pm.status(200), `pm.test('all at/below threshold', () => pm.response.json().data.forEach(p => pm.expect(p.stock).to.be.at.most(p.lowStockThreshold)));`] }),
      req('Report – invalid date range (400)', 'GET', '/api/reports/sales?from=2026-06-01&to=2026-01-01', { token: 'adminToken', tests: [pm.status(400)] }),
      req('Customer – reports (403)', 'GET', '/api/reports/sales', { token: 'customerToken', tests: [pm.status(403)] }),
    ]),
    folder('9. Notifications', 'Persisted copies of real-time events', [
      req('Customer – notifications', 'GET', '/api/notifications', { token: 'customerToken', tests: [pm.status(200)] }),
      req('Mark all read', 'PATCH', '/api/notifications/read-all', { token: 'customerToken', tests: [pm.status(200)] }),
    ]),
    folder('10. Logout', 'Refresh-token invalidation', [
      req('Logout', 'POST', '/api/auth/logout', { token: 'customerToken', body: { refreshToken: '{{customerTokenRefresh}}' }, tests: [pm.status(200)] }),
      req('Refresh after logout (401)', 'POST', '/api/auth/refresh', { body: { refreshToken: '{{customerTokenRefresh}}' }, tests: [pm.status(401)] }),
      req('Unknown route (404)', 'GET', '/api/does-not-exist', { tests: [pm.status(404)] }),
    ]),
  ],
};

const env = {
  name: 'ShopSphere Local',
  values: [{ key: 'baseUrl', value: 'http://localhost:5000', enabled: true }],
  _postman_variable_scope: 'environment',
};

const out = path.join(__dirname, '..', 'postman');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'ShopSphere.postman_collection.json'), `${JSON.stringify(collection, null, 2)}\n`);
fs.writeFileSync(path.join(out, 'ShopSphere.postman_environment.json'), `${JSON.stringify(env, null, 2)}\n`);
const count = collection.item.reduce((n, f) => n + f.item.length, 0);
console.log(`Wrote ${count} requests to postman/`);
