const mongoose = require('mongoose');

const apiLogSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  service: {
    type: String,
    enum: ['snapchat', 'stripe', 'internal'],
    required: true,
  },
  action: {
    type: String,
    required: true,
  },
  method: {
    type: String,
    enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  },
  endpoint: {
    type: String,
  },
  statusCode: {
    type: Number,
  },
  success: {
    type: Boolean,
    default: true,
  },
  requestData: {
    type: mongoose.Schema.Types.Mixed,
  },
  responseData: {
    type: mongoose.Schema.Types.Mixed,
  },
  error: {
    message: String,
    stack: String,
  },
  duration: {
    type: Number,
  },
  ipAddress: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 2592000,
  },
}, {
  timestamps: true,
});

apiLogSchema.index({ user: 1, createdAt: -1 });
apiLogSchema.index({ service: 1, success: 1 });

module.exports = mongoose.model('ApiLog', apiLogSchema);
