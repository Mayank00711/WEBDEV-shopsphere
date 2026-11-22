const { Joi, idParam, pagination } = require('./common');
const { ORDER_STATUSES } = require('../models/Order');

module.exports = {
  checkout: {
    body: Joi.object({
      shippingAddress: Joi.object({
        fullName: Joi.string().trim().min(2).max(80).required(),
        line1: Joi.string().trim().min(3).max(200).required(),
        city: Joi.string().trim().max(60).required(),
        state: Joi.string().trim().max(60).required(),
        postalCode: Joi.string().trim().pattern(/^[0-9A-Za-z -]{3,10}$/).required(),
        country: Joi.string().trim().max(60).default('India'),
        phone: Joi.string().trim().pattern(/^[0-9+\- ]{7,15}$/).required(),
      }).required(),
      paymentMethod: Joi.string().valid('SIMULATED_CARD', 'SIMULATED_UPI', 'COD').required(),
      couponCode: Joi.string().trim().uppercase().max(20),
      // Simulates a declined payment so the failure path can be demonstrated.
      simulatePaymentFailure: Joi.boolean().default(false),
    }),
  },
  list: {
    query: Joi.object({
      ...pagination,
      status: Joi.string().valid(...ORDER_STATUSES),
      from: Joi.date().iso(),
      to: Joi.date().iso(),
    }),
  },
  updateStatus: {
    params: idParam,
    body: Joi.object({
      status: Joi.string().valid(...ORDER_STATUSES).required(),
      note: Joi.string().trim().max(200),
    }),
  },
  byId: { params: idParam },
};
