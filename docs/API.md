# ShopSphere API Reference

Base URL: `http://localhost:5000/api`. All bodies are JSON. Protected routes need `Authorization: Bearer <accessToken>`.

**Auth column:** Public = no token; Any = any logged-in user; otherwise the roles allowed.

Every response has the shape `{ success, message, data, meta? }`; errors are `{ success: false, message, errors?, requestId }`.

Common errors on every protected route: `401` missing/invalid/expired token, `403` role not allowed, `400` validation failure (with `errors[]` listing each field), `404` unknown id, `500` unexpected error.

---

## 1. Authentication `/api/auth`

| Method | Endpoint | Auth | Body | Success | Errors |
|---|---|---|---|---|---|
| POST | `/auth/register` | Public | `name`, `email`, `password` (8+ chars, letter + number), `role` (`customer`\|`seller`, default customer), `storeName` (required for sellers), `phone?` | 201 `{ user, accessToken, refreshToken }` | 400, 409 email exists, 429 |
| POST | `/auth/login` | Public | `email`, `password` | 200 `{ user, accessToken, refreshToken }` | 400, 401 invalid credentials, 403 deactivated, 429 |
| POST | `/auth/refresh` | Public | `refreshToken` | 200 new `{ accessToken, refreshToken }` (old one is consumed) | 401 invalid/expired/reused |
| POST | `/auth/logout` | Any | `refreshToken`, `allDevices?` (bool) | 200 | 401 |
| POST | `/auth/change-password` | Any | `currentPassword`, `newPassword` | 200 new tokens, other sessions revoked | 400, 401 wrong current password |

**Token design.** The access token (15 min) carries `{ sub, role, tv }`. The refresh token (7 days) carries `{ sub, jti }` and is stored only as a SHA-256 hash in `user.refreshTokens` (max 5 sessions). Each refresh rotates the pair; presenting an already-used refresh token is treated as theft and revokes every session. `logout` with `allDevices: true`, a password change, a role change or deactivation increments `tokenVersion`, which immediately invalidates outstanding access tokens.

Sample `POST /auth/login`:

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": { "_id": "6734…", "name": "Aarav Sharma", "email": "aarav@shopsphere.dev", "role": "customer", "isActive": true },
    "accessToken": "eyJhbGciOiJIUzI1NiIs…",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs…",
    "tokenType": "Bearer"
  }
}
```

## 2. Users `/api/users`

| Method | Endpoint | Auth | Body / Query | Success | Errors |
|---|---|---|---|---|---|
| GET | `/users/me` | Any | | 200 profile | 401 |
| PATCH | `/users/me` | Any | `name?`, `phone?`, `address?`, `storeName?` (sellers). `role`, `email`, `isActive` are ignored | 200 | 400 |
| GET | `/users` | admin | `page`, `limit`, `role`, `search`, `isActive` | 200 list + meta | 403 |
| POST | `/users` | admin | `name`, `email`, `password`, `role` (incl. admin) | 201 | 400, 409 |
| GET | `/users/:id` | admin | | 200 | 400, 404 |
| PATCH | `/users/:id` | admin | `name?`, `role?`, `isActive?`, `storeName?` | 200 | 404, 422 cannot demote/deactivate self |
| DELETE | `/users/:id` | admin | | 200 | 404, 422 cannot delete self |

## 3. Categories `/api/categories`

| Method | Endpoint | Auth | Body | Success | Errors |
|---|---|---|---|---|---|
| GET | `/categories` | Public | | 200 active categories with `productCount` | |
| GET | `/categories/:id` | Public | | 200 | 400, 404 |
| POST | `/categories` | admin | `name`, `description?` | 201 (slug generated) | 400, 409 duplicate |
| PATCH | `/categories/:id` | admin | `name?`, `description?`, `isActive?` | 200 | 404, 409 |
| DELETE | `/categories/:id` | admin | | 200 | 404, 409 category still has products |

## 4. Products `/api/products`

| Method | Endpoint | Auth | Body / Query | Success | Errors |
|---|---|---|---|---|---|
| GET | `/products` | Public | `page`, `limit` (≤100), `search` (text index), `category`, `seller`, `minPrice`, `maxPrice`, `inStock`, `sort` (`price`, `-price`, `name`, `-name`, `createdAt`, `-createdAt`, `stock`, `-stock`) | 200 list + meta | 400 invalid filter / min > max |
| GET | `/products/mine` | seller, admin | same as above; includes inactive products; sellers see only their own | 200 | 403 |
| GET | `/products/:id` | Public | | 200 (populated category and seller) | 400, 404 |
| POST | `/products` | seller, admin | `name`, `price`, `category`, `stock`, `description?`, `lowStockThreshold?`, `sku?`, `images?`, `seller?` (admin only) | 201 | 400 incl. unknown category, 403, 409 duplicate SKU |
| PATCH | `/products/:id` | owner seller, admin | any field except `stock` | 200 | 400 (stock not allowed here), 403 not owner, 404 |
| DELETE | `/products/:id` | owner seller, admin | | 200 | 403, 404 |
| PATCH | `/products/:id/stock` | owner seller, admin | `change` (non-zero integer, negative removes), `reason` (`restock`\|`adjustment`) | 200 updated product | 403, 404, 422 would go negative |
| GET | `/products/:id/stock-history` | owner seller, admin | | 200 last 50 stock movements | 403, 404 |

Sample `GET /products?search=headphones&limit=1`:

```json
{
  "success": true, "message": "OK",
  "data": [{
    "_id": "6734…", "name": "Aura ANC Wireless Headphones", "price": 7999, "stock": 40, "lowStockThreshold": 5,
    "category": { "_id": "6734…", "name": "Electronics", "slug": "electronics" },
    "seller": { "_id": "6734…", "name": "Rohan Mehta", "storeName": "TechNova" },
    "sku": "SKU-0001", "isActive": true, "isLowStock": false
  }],
  "meta": { "total": 1, "page": 1, "limit": 1, "totalPages": 1 }
}
```

## 5. Cart `/api/cart` (customer only, always the caller's own cart)

| Method | Endpoint | Body | Success | Errors |
|---|---|---|---|---|
| GET | `/cart` | | 200 priced cart | |
| POST | `/cart/items` | `productId`, `quantity` (1–100, added to existing) | 200 priced cart | 400, 404 product, 422 not enough stock |
| PATCH | `/cart/items/:productId` | `quantity` | 200 | 404 not in cart, 422 |
| DELETE | `/cart/items/:productId` | | 200 | 404 not in cart |
| DELETE | `/cart` | | 200 empty cart | |

A priced cart is computed from live product prices on every request (any `price` sent by the client is stripped):

```json
{ "items": [{ "product": { "_id": "…", "name": "Clean Code", "stock": 55 }, "quantity": 2, "unitPrice": 699, "lineTotal": 1398 }],
  "itemCount": 2, "subtotal": 1398, "shippingFee": 0, "total": 1398, "issues": [] }
```

## 6. Coupons `/api/coupons`

| Method | Endpoint | Auth | Body | Success | Errors |
|---|---|---|---|---|---|
| POST | `/coupons/apply` | customer | `code` | 200 preview `{ code, discount, subtotal, totalAfterDiscount }` | 422 invalid/expired/limit/min order |
| GET | `/coupons` | admin | | 200 | 403 |
| POST | `/coupons` | admin | `code`, `type` (`percent`\|`flat`), `value`, `expiresAt` (future), `maxDiscount?`, `minOrderValue?`, `usageLimit?` | 201 | 400, 409 |
| PATCH | `/coupons/:id` | admin | any field | 200 | 404 |
| DELETE | `/coupons/:id` | admin | | 200 | 404 |

## 7. Orders `/api/orders`

| Method | Endpoint | Auth | Body / Query | Success | Errors |
|---|---|---|---|---|---|
| POST | `/orders` | customer | `shippingAddress { fullName, line1, city, state, postalCode, phone, country? }`, `paymentMethod` (`SIMULATED_CARD`\|`SIMULATED_UPI`\|`COD`), `couponCode?`, `simulatePaymentFailure?` | 201 order | 400, 402 simulated decline, 409 insufficient stock, 422 empty cart / unavailable product / coupon |
| GET | `/orders` | Any | `page`, `limit`, `status`, `from`, `to`. Customers see their own, sellers see orders containing their products, admins see all | 200 list + meta | 400 |
| GET | `/orders/:id` | Any (scoped as above) | | 200 | 404 (also for orders you may not see) |
| PATCH | `/orders/:id/status` | Any (rules below) | `status`, `note?` | 200 | 403, 404, 409 already in that state / concurrent update, 422 invalid transition |

**Checkout steps (server side):** load cart → re-validate each product and snapshot its current price → compute subtotal, coupon discount, shipping and total → simulated payment → atomically reserve stock for every item (all-or-nothing; reserved items are released if any item fails) → increment coupon usage → create order → clear cart → emit `order.placed`.

**Status rules:**

| From | Allowed to |
|---|---|
| pending | confirmed, cancelled |
| confirmed | shipped, cancelled |
| shipped | delivered |
| delivered / cancelled | (final) |

Customers may only cancel their own orders. Sellers may update orders whose items are all theirs. Admins may update any order. Cancelling restores stock (recorded in the stock audit trail) and marks a paid simulated payment as `refunded`. Delivering a COD order marks it `paid`.

## 8. Reports `/api/reports` (seller, admin)

Sellers always get figures for their own products only; admins see the whole platform and may pass `seller=<id>`. Cancelled orders are excluded from sales figures.

| Method | Endpoint | Query | Returns |
|---|---|---|---|
| GET | `/reports/sales` | `from?`, `to?`, `groupBy` (`day`\|`month`) | `{ totals { revenue, orders, units, avgOrderValue }, periods[] }` |
| GET | `/reports/top-products` | `from?`, `to?`, `limit` (≤50) | `[{ productId, name, unitsSold, revenue, orderCount, currentStock, currentPrice }]` |
| GET | `/reports/category-sales` | `from?`, `to?` | `[{ category, revenue, units }]` |
| GET | `/reports/inventory` | | `{ totals { products, unitsInStock, stockValue, lowStock, outOfStock }, byCategory[] }` |
| GET | `/reports/low-stock` | `limit` | products where `stock <= lowStockThreshold` |

Errors: 400 when `to` is before `from`, 403 for customers.

## 9. Notifications `/api/notifications` (any user)

| Method | Endpoint | Query | Returns |
|---|---|---|---|
| GET | `/notifications` | `page`, `limit`, `unread=true` | list + `meta.unread` |
| PATCH | `/notifications/:id/read` | | 200 |
| PATCH | `/notifications/read-all` | | `{ updated }` |

## 10. Health

`GET /api/health` → `{ uptime, db: "connected", onlineUsers, memoryMB }`

---

## Socket.IO (real-time)

**Connect:** `io("http://localhost:5000", { auth: { token: "<accessToken>" } })`. Connections without a valid access token are rejected with `connect_error: "UNAUTHORIZED: …"`.

**Rooms:** every socket joins `user:<userId>` and `role:<role>`. Clients can also join `product:<productId>` to receive live stock.

| Direction | Event | Payload | Sent to | Trigger |
|---|---|---|---|---|
| server → client | `connected` | `{ userId, role }` | the socket | after successful auth |
| server → client | `order:new` | `{ orderId, orderNumber, items, total }` | each seller in the order, and `role:admin` | `order.placed` |
| server → client | `order:status` | `{ orderId, orderNumber, from, to }` | the order's customer | `order.status_changed` |
| server → client | `stock:low` | `{ productId, name, stock, threshold }` | the product's seller and `role:admin` | stock crosses its threshold downward |
| server → client | `product:stock` | `{ productId, stock }` | `product:<id>` room | any stock change |
| server → client | `notification` | persisted Notification document | `user:<id>` | every notification |
| client → server | `product:watch` | `productId`, ack `{ ok }` | | open a product page |
| client → server | `product:unwatch` | `productId` | | leave a product page |

**EventEmitter → Socket.IO:** services emit domain events on `src/events/eventBus.js` (`order.placed`, `order.status_changed`, `stock.low`, `stock.changed`). `src/events/listeners.js` subscribes to them, saves a `Notification` document (so offline users can fetch it later via REST) and pushes the event to the right Socket.IO rooms. The order service never imports Socket.IO, which keeps business logic decoupled from delivery.
