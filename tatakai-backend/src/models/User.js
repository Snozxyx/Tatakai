const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters long'],
    maxlength: [20, 'Username cannot exceed 20 characters'],
    match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email address']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters long'],
    select: false // Don't include password in queries by default
  },
  profile: {
    displayName: {
      type: String,
      trim: true,
      maxlength: [50, 'Display name cannot exceed 50 characters']
    },
    avatar: {
      type: String,
      default: null
    },
    bio: {
      type: String,
      maxlength: [200, 'Bio cannot exceed 200 characters']
    },
    preferences: {
      theme: {
        type: String,
        enum: ['light', 'dark', 'system'],
        default: 'dark'
      },
      language: {
        type: String,
        enum: ['en', 'ja', 'es', 'fr', 'de'],
        default: 'en'
      },
      autoPlay: {
        type: Boolean,
        default: true
      },
      autoSkip: {
        type: Boolean,
        default: true
      },
      // Enhanced playback settings
      autoSkipIntros: {
        type: Boolean,
        default: true
      },
      autoSkipOutros: {
        type: Boolean,
        default: true
      },
      autoPlayNext: {
        type: Boolean,
        default: true
      },
      videoQuality: {
        type: String,
        enum: ['auto', '1080p', '720p', '480p'],
        default: 'auto'
      },
      subtitleLanguage: {
        type: String,
        enum: ['en', 'ja', 'es', 'fr', 'de', 'off'],
        default: 'en'
      },
      // Account settings
      syncHistory: {
        type: Boolean,
        default: true
      },
      emailNotifications: {
        type: Boolean,
        default: true
      },
      parentalControls: {
        type: Boolean,
        default: false
      },
      // Privacy settings
      profileVisibility: {
        type: String,
        enum: ['public', 'private'],
        default: 'private'
      },
      activitySharing: {
        type: Boolean,
        default: false
      },
      analyticsOptOut: {
        type: Boolean,
        default: false
      }
    },
    cache: {
      lastClearDate: {
        type: Date,
        default: null
      },
      searchHistory: [{
        query: String,
        timestamp: {
          type: Date,
          default: Date.now
        }
      }],
      recentlyViewed: [{
        animeId: String,
        timestamp: {
          type: Date,
          default: Date.now
        }
      }]
    }
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  lastLoginAt: {
    type: Date,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret.password;
      return ret;
    }
  }
});

// Indexes for performance
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });
userSchema.index({ createdAt: -1 });

// Hash password before saving
userSchema.pre('save', async function(next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) return next();
  
  try {
    // Hash password with cost of 12
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Instance method to check password
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw error;
  }
};

// Instance method to update last login
userSchema.methods.updateLastLogin = function() {
  this.lastLoginAt = new Date();
  return this.save({ validateBeforeSave: false });
};

// Static method to find active users
userSchema.statics.findActive = function() {
  return this.find({ isActive: true });
};

module.exports = mongoose.model('User', userSchema);