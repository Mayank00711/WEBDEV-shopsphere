const { Joi, objectId, idParam, pagination } = require('./common');

const base = {
  name: Joi.string().trim().min(2).max(120),
  description: Joi.string().trim().max(2000).allow(''),
  price: Joi.number().min(0).precision(2),
  category: objectId,
  stock: Joi.number().integer().min(0),
  lowStockThreshold: Joi.number().integer().min(0),
  sku: Joi.string().trim().uppercase().pattern(/^[A-Z0-9-]{3,30}$/),
  images: Joi.array().items(Joi.string().uri()).max(10),
  isActive: Joi.boolean(),
};

module.exports = {
  list: {
    query: Joi.object({
      ...pagination,
      search: Joi.string().trim().max(100),
      category: objectId,
      seller: objectId,
      minPrice: Joi.number().min(0),
      maxPrice: Joi.number().min(0),
      inStock: Joi.boolean(),
      sort: Joi.string().valid('price', '-price', 'name', '-name', 'createdAt', '-createdAt', 'stock', '-stock').default('-createdAt'),
    }),
  },
  create: {
    body: Joi.object({
      ...base,
      name: base.name.required(),
      price: base.price.required(),
      category: base.category.required(),
      stock: base.stock.required(),
      // Admins may create a product on behalf of a seller.
      seller: objectId,
    }),
  },
  update: {
    params: idParam,
    // stock is deliberately excluded; it changes only via /stock so every change is audited.
    body: Joi.object({ ...base, stock: Joi.forbidden() }).min(1),
  },
  adjustStock: {
    params: idParam,
    body: Joi.object({
      change: Joi.number().integer().invalid(0).required(),
      reason: Joi.string().valid('restock', 'adjustment').default('restock'),
    }),
  },
  byId: { params: idParam },
};
