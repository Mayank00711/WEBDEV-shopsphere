# Database Design

MongoDB database `shopsphere`, modelled with Mongoose. Relationships use `ObjectId` references; order line items embed price snapshots so historical orders never change when a product's price or name changes.

## Entity relationships

```
User (customer) 1 ─── 1 Cart ─── * CartItem ──> Product
User (customer) 1 ─── * Order ─── * OrderItem ──> Product, User (seller)
User (seller)   1 ─── * Product * ─── 1 Category
Product         1 ─── * StockMovement ──> Order?, User (by)
User            1 ─── * Notification
Coupon (referenced by code on Order)
```

## Collections

### users
| Field | Type | Rules |
|---|---|---|
| name | String | required, 2–80 |
| email | String | required, **unique**, lowercase, email format |
| password | String | bcrypt hash, `select: false`, never returned |
| role | String | `customer` \| `seller` \| `admin`, default customer |
| phone, address{line1, city, state, postalCode, country} | | optional |
| storeName | String | sellers |
| isActive | Boolean | default true |
| tokenVersion | Number | incremented to revoke access tokens |
| refreshTokens[] | {tokenHash, expiresAt} | SHA-256 hashes, `select: false` |

Indexes: `{ email: 1 }` unique, `{ role: 1, createdAt: -1 }`.

### categories
`name` (unique), `slug` (unique, generated in a `pre('validate')` hook), `description`, `isActive`.

### products
| Field | Type | Rules |
|---|---|---|
| name | String | required, 2–120 |
| description | String | ≤ 2000 |
| price | Number | required, ≥ 0 |
| category | ObjectId → categories | required, existence checked before save |
| seller | ObjectId → users | required (owner) |
| stock | Number | required, integer, **≥ 0** |
| lowStockThreshold | Number | default 5 |
| sku | String | unique (sparse), uppercase |
| images[], isActive | | |

Virtual `isLowStock`. Indexes:
- **Text index** `{ name: 'text', description: 'text' }` (name weighted 5×) for `GET /products?search=`
- **Compound** `{ category: 1, price: 1 }` for category + price filters and sorting
- `{ seller: 1, createdAt: -1 }` for seller inventory and ownership queries
- `{ sku: 1 }` unique sparse

### carts
`user` (ObjectId → users, **unique**: one cart per customer), `items[] { product → products, quantity 1–100 }`. Prices are deliberately **not** stored; they are read live when the cart is priced.

### orders
| Field | Type | Notes |
|---|---|---|
| orderNumber | String | unique, generated |
| customer | ObjectId → users | |
| items[] | { product, seller, name, unitPrice, quantity, lineTotal } | **snapshots** at checkout; ≥ 1 item |
| subtotal, discount, shippingFee, total | Number | all computed on the server |
| couponCode | String | |
| shippingAddress | embedded | required fields validated |
| status | String | `pending`, `confirmed`, `shipped`, `delivered`, `cancelled` |
| statusHistory[] | { status, changedBy, note, at } | audit of every change |
| payment | { method, status, transactionId, simulated: true, paidAt } | simulated gateway |

Indexes: `{ customer: 1, createdAt: -1 }` (order history), `{ 'items.seller': 1, createdAt: -1 }` (multikey; seller orders and seller-scoped reports), `{ status: 1, createdAt: -1 }` (admin filters, date-range reports), `{ orderNumber: 1 }` unique.

### coupons
`code` (unique, uppercase), `type` (`percent`|`flat`), `value` (percent ≤ 100), `maxDiscount`, `minOrderValue`, `expiresAt`, `usageLimit`, `usedCount`, `isActive`. Usage is incremented atomically with `{ usedCount: { $lt: usageLimit } }`.

### stockmovements (inventory audit trail)
`product`, `change` (+/−), `reason` (`order`, `cancellation`, `restock`, `adjustment`), `order?`, `by`, `stockAfter`, `createdAt`. Index `{ product: 1, createdAt: -1 }`.

### notifications
`user`, `type` (`order.placed`, `order.status_changed`, `stock.low`), `title`, `message`, `data`, `read`. Index `{ user: 1, read: 1, createdAt: -1 }`.

## Preventing overselling

Stock is reserved with a single conditional update:

```js
Product.findOneAndUpdate(
  { _id: productId, isActive: true, stock: { $gte: qty } },  // condition
  { $inc: { stock: -qty } },                                  // update
  { new: true }
);
```

MongoDB applies the match and the `$inc` atomically on one document, so when two customers race for the last unit only one update matches; the other gets `null` and receives `409 Insufficient stock`. For multi-item orders, items are reserved one by one; if any fails, the already-reserved items are given back (compensation), so an order is all-or-nothing. The automated test *"two customers racing for the last unit"* proves this. The schema's `min: 0` validator is a second line of defence.

## Aggregation pipelines

| # | Report | Key stages |
|---|---|---|
| 1 | Sales summary (`/reports/sales`) | `$match` (not cancelled, date range, seller) → `$unwind items` → `$group` by period + order → `$group` by period → `$addFields avgOrderValue` → `$sort` → `$project` |
| 2 | Top products (`/reports/top-products`) | `$match` → `$unwind items` → `$group` by product (`$sum` units/revenue, `$addToSet` orders) → `$sort` → `$limit` → `$lookup products` (current stock/price) → `$project` |
| 3 | Category sales (`/reports/category-sales`) | `$unwind items` → `$lookup products` → `$group` by category → `$lookup categories` → `$sort` |
| 4 | Inventory summary (`/reports/inventory`) | `$match` active → `$facet { byCategory: [$group, $lookup, $project], totals: [$group] }` with `$cond` to count low/out-of-stock |
| 5 | Low stock (`/reports/low-stock`) | `$match` with `$expr: { $lte: ['$stock', '$lowStockThreshold'] }` → `$sort` → `$lookup users` |

The category list endpoint also uses a `$lookup` sub-pipeline to attach live product counts.

## Seed data

`npm run seed` drops the database, syncs indexes and inserts: 6 users (1 admin, 2 sellers, 3 customers), 6 categories, 30 products (some low/out of stock on purpose), 3 coupons (one expired), 45 orders spread across the last 60 days in every status, a cart for the demo customer and initial stock movements. The generator is deterministic, so every run produces the same data.
