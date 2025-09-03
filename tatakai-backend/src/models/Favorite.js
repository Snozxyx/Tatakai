const mongoose = require('mongoose');

const favoriteSchema = new mongoose.Schema({
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
  animeType: {
    type: String,
    enum: ['TV', 'Movie', 'OVA', 'ONA', 'Special', 'Music'],
    default: 'TV'
  },
  animeStatus: {
    type: String,
    enum: ['Completed', 'Ongoing', 'Upcoming', 'Unknown'],
    default: 'Unknown'
  },
  animeRating: {
    type: String,
    default: null
  },
  genres: [{
    type: String,
    trim: true
  }],
  addedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  notes: {
    type: String,
    maxlength: [500, 'Notes cannot exceed 500 characters'],
    trim: true
  },
  personalRating: {
    type: Number,
    min: [1, 'Rating must be at least 1'],
    max: [10, 'Rating cannot exceed 10'],
    default: null
  }
}, {
  timestamps: true
});

// Compound index to prevent duplicate favorites
favoriteSchema.index({ userId: 1, animeId: 1 }, { unique: true });
favoriteSchema.index({ userId: 1, addedAt: -1 });
favoriteSchema.index({ userId: 1, personalRating: -1 });

// Static method to get user's favorites with pagination
favoriteSchema.statics.getUserFavorites = function(userId, page = 1, limit = 20, sortBy = 'addedAt', sortOrder = -1) {
  const skip = (page - 1) * limit;
  const sortOptions = {};
  sortOptions[sortBy] = sortOrder;
  
  return this.find({ userId })
    .sort(sortOptions)
    .skip(skip)
    .limit(limit)
    .populate('userId', 'username profile.displayName');
};

// Static method to check if anime is favorited by user
favoriteSchema.statics.isFavorited = function(userId, animeId) {
  return this.findOne({ userId, animeId });
};

// Static method to get favorites count for user
favoriteSchema.statics.getFavoritesCount = function(userId) {
  return this.countDocuments({ userId });
};

// Static method to get favorite genres for user
favoriteSchema.statics.getFavoriteGenres = function(userId) {
  return this.aggregate([
    { $match: { userId: mongoose.Types.ObjectId(userId) } },
    { $unwind: '$genres' },
    {
      $group: {
        _id: '$genres',
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } },
    { $limit: 10 }
  ]);
};

// Static method to get recommendations based on favorite genres
favoriteSchema.statics.getRecommendationData = function(userId) {
  return this.aggregate([
    { $match: { userId: mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: null,
        favoriteGenres: { $push: '$genres' },
        favoriteTypes: { $push: '$animeType' },
        averageRating: { $avg: '$personalRating' },
        totalFavorites: { $sum: 1 }
      }
    },
    {
      $project: {
        _id: 0,
        favoriteGenres: {
          $reduce: {
            input: '$favoriteGenres',
            initialValue: [],
            in: { $setUnion: ['$$value', '$$this'] }
          }
        },
        favoriteTypes: 1,
        averageRating: { $round: ['$averageRating', 1] },
        totalFavorites: 1
      }
    }
  ]);
};

module.exports = mongoose.model('Favorite', favoriteSchema);