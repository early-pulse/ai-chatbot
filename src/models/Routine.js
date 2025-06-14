const mongoose = require('mongoose');

const routineSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  routine: {
    type: [String],
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt timestamp before saving
routineSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Routine', routineSchema); 