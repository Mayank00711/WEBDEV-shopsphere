const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const config = require('../config/env');

const ROLES = ['customer', 'seller', 'admin'];

const addressSchema = new mongoose.Schema(
  {
    line1: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    postalCode: { type: String, trim: true },
    country: { type: String, trim: true, default: 'India' },
  },
  { _id: false }
);

const refreshTokenSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true, minlength: 2, maxlength: 80 },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Email is invalid'],
    },
    password: { type: String, required: true, minlength: 8, select: false },
    role: { type: String, enum: ROLES, default: 'customer' },
    phone: { type: String, trim: true },
    address: addressSchema,
    storeName: { type: String, trim: true }, // sellers only
    isActive: { type: Boolean, default: true },
    // Incremented on "logout from all devices" or password change; access tokens carry it.
    tokenVersion: { type: Number, default: 0 },
    refreshTokens: { type: [refreshTokenSchema], select: false, default: [] },
  },
  { timestamps: true }
);

userSchema.index({ role: 1, createdAt: -1 });

// Hash the password whenever it is set or changed. Plain text is never stored.
userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, config.bcryptRounds);
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.password;
    delete ret.refreshTokens;
    delete ret.tokenVersion;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
module.exports.ROLES = ROLES;
