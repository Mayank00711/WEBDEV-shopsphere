const mongoose = require('mongoose');

const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, maxlength: 60 },
    slug: { type: String, unique: true, lowercase: true },
    description: { type: String, trim: true, maxlength: 300 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

categorySchema.pre('validate', function setSlug() {
  if (this.isModified('name')) this.slug = slugify(this.name);
});

module.exports = mongoose.model('Category', categorySchema);
module.exports.slugify = slugify;
