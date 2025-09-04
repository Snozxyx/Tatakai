const express = require('express');
const { body, query, validationResult } = require('express-validator');
const WatchHistory = require('../models/WatchHistory');
const { auth } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/watch-history
// @desc    Get user's watch history
// @access  Private
router.get('/', [
  auth,
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const history = await WatchHistory.getUserHistory(req.user._id, page, limit);
    const totalCount = await WatchHistory.countDocuments({ userId: req.user._id });

    res.json({
      success: true,
      data: {
        history,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalItems: totalCount,
          itemsPerPage: limit,
          hasNextPage: page < Math.ceil(totalCount / limit),
          hasPrevPage: page > 1
        }
      }
    });
  } catch (error) {
    console.error('Get watch history error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/watch-history/recent
// @desc    Get recently watched anime
// @access  Private
router.get('/recent', [
  auth,
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50')
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

    const limit = parseInt(req.query.limit) || 10;
    const recentAnime = await WatchHistory.getRecentlyWatched(req.user._id, limit);

    res.json({
      success: true,
      data: {
        recentAnime
      }
    });
  } catch (error) {
    console.error('Get recent watch history error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/watch-history/anime/:animeId
// @desc    Get watch progress for specific anime
// @access  Private
router.get('/anime/:animeId', auth, async (req, res) => {
  try {
    const { animeId } = req.params;
    const progress = await WatchHistory.getAnimeProgress(req.user._id, animeId);

    res.json({
      success: true,
      data: {
        animeId,
        episodes: progress
      }
    });
  } catch (error) {
    console.error('Get anime progress error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/watch-history
// @desc    Add or update watch progress
// @access  Private
router.post('/', [
  auth,
  body('animeId')
    .notEmpty()
    .withMessage('Anime ID is required'),
  body('animeTitle')
    .notEmpty()
    .withMessage('Anime title is required'),
  body('episode.number')
    .isInt({ min: 1 })
    .withMessage('Episode number must be a positive integer'),
  body('episode.id')
    .notEmpty()
    .withMessage('Episode ID is required'),
  body('progress.currentTime')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Current time must be a non-negative number'),
  body('progress.duration')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Duration must be a non-negative number')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const {
      animeId,
      animeTitle,
      animePoster,
      episode,
      progress
    } = req.body;

    const watchData = {
      userId: req.user._id,
      animeId,
      animeTitle,
      animePoster: animePoster || null,
      episode: {
        number: episode.number,
        title: episode.title || null,
        id: episode.id
      },
      progress: {
        currentTime: progress?.currentTime || 0,
        duration: progress?.duration || 0
      },
      lastWatchedAt: new Date()
    };

    // Update or create watch history entry
    const updatedHistory = await WatchHistory.findOneAndUpdate(
      {
        userId: req.user._id,
        animeId,
        'episode.number': episode.number
      },
      watchData,
      {
        new: true,
        upsert: true,
        runValidators: true
      }
    );

    res.json({
      success: true,
      message: 'Watch progress updated successfully',
      data: {
        watchHistory: updatedHistory
      }
    });
  } catch (error) {
    console.error('Update watch progress error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   DELETE /api/watch-history/:id
// @desc    Delete watch history entry
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const deletedEntry = await WatchHistory.findOneAndDelete({
      _id: id,
      userId: req.user._id
    });

    if (!deletedEntry) {
      return res.status(404).json({
        success: false,
        message: 'Watch history entry not found'
      });
    }

    res.json({
      success: true,
      message: 'Watch history entry deleted successfully'
    });
  } catch (error) {
    console.error('Delete watch history error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   DELETE /api/watch-history/anime/:animeId
// @desc    Delete all watch history for specific anime
// @access  Private
router.delete('/anime/:animeId', auth, async (req, res) => {
  try {
    const { animeId } = req.params;

    const result = await WatchHistory.deleteMany({
      userId: req.user._id,
      animeId
    });

    res.json({
      success: true,
      message: `Deleted ${result.deletedCount} watch history entries for anime`,
      data: {
        deletedCount: result.deletedCount
      }
    });
  } catch (error) {
    console.error('Delete anime watch history error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;