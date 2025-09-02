const mongoose = require('mongoose');

const watchHistorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  animeId: {
    type: String,
    required: [true, 'Anime ID is required'],
    index: true
  },
  animeTitle: {
    type: String,
    required: [true, 'Anime title is required'],
    trim: true
  },
  animePoster: {
    type: String,
    default: null
  },
  episode: {
    number: {
      type: Number,
      required: [true, 'Episode number is required'],
      min: [1, 'Episode number must be at least 1']
    },
    title: {
      type: String,
      trim: true
    },
    id: {
      type: String,
      required: [true, 'Episode ID is required']
    }
  },
  progress: {
    currentTime: {
      type: Number,
      default: 0,
      min: [0, 'Current time cannot be negative']
    },
    duration: {
      type: Number,
      default: 0,
      min: [0, 'Duration cannot be negative']
    },
    percentage: {
      type: Number,
      default: 0,
      min: [0, 'Percentage cannot be negative'],
      max: [100, 'Percentage cannot exceed 100']
    }
  },
  isCompleted: {
    type: Boolean,
    default: false
  },
  lastWatchedAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
watchHistorySchema.index({ userId: 1, animeId: 1, 'episode.number': 1 }, { unique: true });
watchHistorySchema.index({ userId: 1, lastWatchedAt: -1 });
watchHistorySchema.index({ userId: 1, isCompleted: 1 });

// Update percentage when progress changes
watchHistorySchema.pre('save', function(next) {
  if (this.progress.duration > 0) {
    this.progress.percentage = Math.round((this.progress.currentTime / this.progress.duration) * 100);
    // Mark as completed if watched more than 90%
    this.isCompleted = this.progress.percentage >= 90;
  }
  next();
});

// Static method to get user's watch history with pagination
watchHistorySchema.statics.getUserHistory = function(userId, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  
  return this.find({ userId })
    .sort({ lastWatchedAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('userId', 'username profile.displayName');
};

// Static method to get user's progress for a specific anime
watchHistorySchema.statics.getAnimeProgress = function(userId, animeId) {
  return this.find({ userId, animeId })
    .sort({ 'episode.number': 1 });
};

// Static method to get recently watched anime
watchHistorySchema.statics.getRecentlyWatched = function(userId, limit = 10) {
  return this.aggregate([
    { $match: { userId: mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: '$animeId',
        animeTitle: { $first: '$animeTitle' },
        animePoster: { $first: '$animePoster' },
        lastWatchedAt: { $max: '$lastWatchedAt' },
        episodeCount: { $sum: 1 },
        completedCount: {
          $sum: { $cond: [{ $eq: ['$isCompleted', true] }, 1, 0] }
        },
        lastEpisode: {
          $last: {
            number: '$episode.number',
            title: '$episode.title',
            currentTime: '$progress.currentTime',
            duration: '$progress.duration',
            percentage: '$progress.percentage'
          }
        }
      }
    },
    { $sort: { lastWatchedAt: -1 } },
    { $limit: limit }
  ]);
};

module.exports = mongoose.model('WatchHistory', watchHistorySchema);