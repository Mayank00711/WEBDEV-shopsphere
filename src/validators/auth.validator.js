const { Joi } = require('./common');

const password = Joi.string().min(8).max(64)
  .pattern(/[A-Za-z]/, 'letter').pattern(/\d/, 'number')
  .messages({ 'string.pattern.name': 'password must contain at least one {#name}' });

module.exports = {
  register: {
    body: Joi.object({
      name: Joi.string().trim().min(2).max(80).required(),
      email: Joi.string().trim().lowercase().email().required(),
      password: password.required(),
      // Public registration can create customers or sellers only; admins are seeded/created by admins.
      role: Joi.string().valid('customer', 'seller').default('customer'),
      storeName: Joi.when('role', { is: 'seller', then: Joi.string().trim().min(2).max(80).required(), otherwise: Joi.forbidden() }),
      phone: Joi.string().trim().pattern(/^[0-9+\- ]{7,15}$/),
    }),
  },
  login: {
    body: Joi.object({
      email: Joi.string().trim().lowercase().email().required(),
      password: Joi.string().required(),
    }),
  },
  refresh: { body: Joi.object({ refreshToken: Joi.string().required() }) },
  logout: { body: Joi.object({ refreshToken: Joi.string().required(), allDevices: Joi.boolean().default(false) }) },
  changePassword: {
    body: Joi.object({ currentPassword: Joi.string().required(), newPassword: password.required() }),
  },
  password,
};
