const express = require('express');
const { body, validationResult } = require('express-validator');
const { auth } = require('../middleware/auth');
const User = require('../models/User');
const WatchHistory = require('../models/WatchHistory');
const Favorites = require('../models/Favorites');

const router = express.Router();

// @route   GET /api/analytics/dashboard
// @desc    Get user analytics dashboard data
// @access  Private
router.get('/dashboard', auth, async (req, res) => {
  try {
    const userId = req.user._id;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get watch statistics
    const watchHistory = await WatchHistory.find({ 
      userId,
      lastWatchedAt: { $gte: thirtyDaysAgo }
    });

    const favorites = await Favorites.find({ userId });

    // Calculate analytics
    const analytics = {
      watchTime: {
        totalMinutes: watchHistory.reduce((total, watch) => total + (watch.watchedDuration || 0), 0),
        episodesWatched: watchHistory.length,
        averageSessionTime: watchHistory.length > 0 ? 
          watchHistory.reduce((total, watch) => total + (watch.watchedDuration || 0), 0) / watchHistory.length : 0
      },
      favorites: {
        totalCount: favorites.length,
        recentlyAdded: favorites.filter(fav => fav.addedAt >= thirtyDaysAgo).length
      },
      activity: {
        mostWatchedDay: this.getMostWatchedDay(watchHistory),
        streakDays: this.calculateWatchStreak(watchHistory),
        topGenres: this.getTopGenres(favorites)
      },
      recommendations: {
        basedOnHistory: await this.getRecommendationsBasedOnHistory(userId),
        trending: await this.getTrendingRecommendations(),
        similar: await this.getSimilarAnimeRecommendations(userId)
      }
    };

    res.json({
      success: true,
      data: { analytics }
    });
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/analytics/recommendations
// @desc    Get personalized recommendations
// @access  Private
router.get('/recommendations', auth, async (req, res) => {
  try {
    const userId = req.user._id;
    const { page = 1, limit = 20, type = 'all' } = req.query;

    let recommendations = [];

    switch (type) {
      case 'history':
        recommendations = await this.getRecommendationsBasedOnHistory(userId);
        break;
      case 'favorites':
        recommendations = await this.getRecommendationsBasedOnFavorites(userId);
        break;
      case 'similar':
        recommendations = await this.getSimilarAnimeRecommendations(userId);
        break;
      case 'trending':
        recommendations = await this.getTrendingRecommendations();
        break;
      default:
        // Mixed recommendations
        const historyRecs = await this.getRecommendationsBasedOnHistory(userId);
        const favoriteRecs = await this.getRecommendationsBasedOnFavorites(userId);
        const trendingRecs = await this.getTrendingRecommendations();
        
        recommendations = [
          ...historyRecs.slice(0, 5),
          ...favoriteRecs.slice(0, 5),
          ...trendingRecs.slice(0, 10)
        ];
        break;
    }

    // Apply pagination
    const startIndex = (page - 1) * limit;
    const paginatedRecs = recommendations.slice(startIndex, startIndex + limit);

    res.json({
      success: true,
      data: {
        recommendations: paginatedRecs,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(recommendations.length / limit),
          totalItems: recommendations.length,
          hasNextPage: startIndex + limit < recommendations.length,
          hasPreviousPage: page > 1
        }
      }
    });
  } catch (error) {
    console.error('Get recommendations error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/analytics/track-event
// @desc    Track user analytics event
// @access  Private
router.post('/track-event', [
  auth,
  body('eventType').notEmpty().withMessage('Event type is required'),
  body('eventData').optional().isObject()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { eventType, eventData } = req.body;
    const userId = req.user._id;

    // Store analytics event (in a real app, this might go to a dedicated analytics service)
    const analyticsEvent = {
      userId,
      eventType,
      eventData,
      timestamp: new Date(),
      userAgent: req.get('User-Agent'),
      ipAddress: req.ip
    };

    // For now, we'll just log it. In a real application, you'd store this in a dedicated analytics collection
    console.log('Analytics event tracked:', analyticsEvent);

    res.json({
      success: true,
      message: 'Event tracked successfully'
    });
  } catch (error) {
    console.error('Track event error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/analytics/stats
// @desc    Get user statistics
// @access  Private
router.get('/stats', auth, async (req, res) => {
  try {
    const userId = req.user._id;
    const { period = '30d' } = req.query;

    let dateFilter = new Date();
    switch (period) {
      case '7d':
        dateFilter.setDate(dateFilter.getDate() - 7);
        break;
      case '30d':
        dateFilter.setDate(dateFilter.getDate() - 30);
        break;
      case '90d':
        dateFilter.setDate(dateFilter.getDate() - 90);
        break;
      case '1y':
        dateFilter.setFullYear(dateFilter.getFullYear() - 1);
        break;
      default:
        dateFilter.setDate(dateFilter.getDate() - 30);
    }

    const watchHistory = await WatchHistory.find({
      userId,
      lastWatchedAt: { $gte: dateFilter }
    });

    const favorites = await Favorites.find({ userId });

    const stats = {
      watchTime: {
        total: watchHistory.reduce((total, watch) => total + (watch.watchedDuration || 0), 0),
        average: watchHistory.length > 0 ? 
          watchHistory.reduce((total, watch) => total + (watch.watchedDuration || 0), 0) / watchHistory.length : 0,
        sessions: watchHistory.length
      },
      content: {
        uniqueAnimes: new Set(watchHistory.map(w => w.animeId)).size,
        completedEpisodes: watchHistory.filter(w => w.isCompleted).length,
        inProgressCount: watchHistory.filter(w => !w.isCompleted && w.progress > 0).length
      },
      engagement: {
        favoriteCount: favorites.length,
        averageRating: favorites.length > 0 ? 
          favorites.reduce((total, fav) => total + (fav.rating || 0), 0) / favorites.length : 0,
        loginStreak: await this.calculateLoginStreak(userId)
      }
    };

    res.json({
      success: true,
      data: { stats, period }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Helper methods
router.getMostWatchedDay = function(watchHistory) {
  const dayCount = {};
  watchHistory.forEach(watch => {
    const day = watch.lastWatchedAt.getDay();
    dayCount[day] = (dayCount[day] || 0) + 1;
  });
  
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const mostWatchedDayIndex = Object.keys(dayCount).reduce((a, b) => dayCount[a] > dayCount[b] ? a : b, 0);
  return days[mostWatchedDayIndex] || 'No data';
};

router.calculateWatchStreak = function(watchHistory) {
  if (watchHistory.length === 0) return 0;
  
  const sortedHistory = watchHistory.sort((a, b) => b.lastWatchedAt - a.lastWatchedAt);
  let streak = 1;
  let currentDate = new Date(sortedHistory[0].lastWatchedAt);
  
  for (let i = 1; i < sortedHistory.length; i++) {
    const watchDate = new Date(sortedHistory[i].lastWatchedAt);
    const diffDays = Math.floor((currentDate - watchDate) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) {
      streak++;
      currentDate = watchDate;
    } else if (diffDays > 1) {
      break;
    }
  }
  
  return streak;
};

router.getTopGenres = function(favorites) {
  const genreCount = {};
  favorites.forEach(fav => {
    if (fav.metadata && fav.metadata.genres) {
      fav.metadata.genres.forEach(genre => {
        genreCount[genre] = (genreCount[genre] || 0) + 1;
      });
    }
  });
  
  return Object.entries(genreCount)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([genre, count]) => ({ genre, count }));
};

router.getRecommendationsBasedOnHistory = async function(userId) {
  // This is a simplified recommendation algorithm
  // In a real application, you'd use more sophisticated ML algorithms
  
  const watchHistory = await WatchHistory.find({ userId }).limit(20);
  const watchedAnimes = watchHistory.map(w => w.animeId);
  
  // Return some dummy recommendations based on watched animes
  return [
    { id: 'rec1', title: 'Recommended Based on History 1', reason: 'Because you watched similar anime' },
    { id: 'rec2', title: 'Recommended Based on History 2', reason: 'Popular among users with similar taste' }
  ];
};

router.getRecommendationsBasedOnFavorites = async function(userId) {
  const favorites = await Favorites.find({ userId }).limit(10);
  
  // Return recommendations based on favorites
  return [
    { id: 'fav1', title: 'Similar to Your Favorites 1', reason: 'Similar to your highly rated anime' },
    { id: 'fav2', title: 'Similar to Your Favorites 2', reason: 'From the same studio' }
  ];
};

router.getSimilarAnimeRecommendations = async function(userId) {
  // Return similar anime recommendations
  return [
    { id: 'sim1', title: 'Similar Anime 1', reason: 'Similar themes and style' },
    { id: 'sim2', title: 'Similar Anime 2', reason: 'Same director' }
  ];
};

router.getTrendingRecommendations = async function() {
  // Return trending recommendations
  return [
    { id: 'trend1', title: 'Trending Anime 1', reason: 'Currently trending' },
    { id: 'trend2', title: 'Trending Anime 2', reason: 'Popular this week' }
  ];
};

router.calculateLoginStreak = async function(userId) {
  // This would calculate login streak based on user activity
  // For now, return a dummy value
  return 7;
};

module.exports = router;