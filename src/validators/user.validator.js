const { Joi, idParam, pagination } = require('./common');
const { password } = require('./auth.validator');

const address = Joi.object({
  line1: Joi.string().trim().max(200),
  city: Joi.string().trim().max(60),
  state: Joi.string().trim().max(60),
  postalCode: Joi.string().trim().pattern(/^[0-9A-Za-z -]{3,10}$/),
  country: Joi.string().trim().max(60),
});

module.exports = {
  // Users may change only these fields on themselves; role/email/isActive are not accepted.
  updateMe: {
    body: Joi.object({
      name: Joi.string().trim().min(2).max(80),
      phone: Joi.string().trim().pattern(/^[0-9+\- ]{7,15}$/),
      address,
      storeName: Joi.string().trim().min(2).max(80),
    }).min(1),
  },
  list: {
    query: Joi.object({
      ...pagination,
      role: Joi.string().valid('customer', 'seller', 'admin'),
      search: Joi.string().trim().max(80),
      isActive: Joi.boolean(),
    }),
  },
  create: {
    body: Joi.object({
      name: Joi.string().trim().min(2).max(80).required(),
      email: Joi.string().trim().lowercase().email().required(),
      password: password.required(),
      role: Joi.string().valid('customer', 'seller', 'admin').required(),
      storeName: Joi.string().trim().min(2).max(80),
      phone: Joi.string().trim().pattern(/^[0-9+\- ]{7,15}$/),
    }),
  },
  adminUpdate: {
    params: idParam,
    body: Joi.object({
      name: Joi.string().trim().min(2).max(80),
      role: Joi.string().valid('customer', 'seller', 'admin'),
      isActive: Joi.boolean(),
      storeName: Joi.string().trim().min(2).max(80),
    }).min(1),
  },
  byId: { params: idParam },
};
