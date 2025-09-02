const express = require('express');
const { body, query, validationResult } = require('express-validator');
const Favorite = require('../models/Favorite');
const { auth } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/favorites
// @desc    Get user's favorite anime
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
    .withMessage('Limit must be between 1 and 100'),
  query('sortBy')
    .optional()
    .isIn(['addedAt', 'animeTitle', 'personalRating'])
    .withMessage('Sort by must be addedAt, animeTitle, or personalRating'),
  query('sortOrder')
    .optional()
    .isIn(['1', '-1', 'asc', 'desc'])
    .withMessage('Sort order must be 1, -1, asc, or desc')
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
    const sortBy = req.query.sortBy || 'addedAt';
    let sortOrder = req.query.sortOrder || '-1';
    
    // Convert string sort order to number
    if (sortOrder === 'asc') sortOrder = 1;
    if (sortOrder === 'desc') sortOrder = -1;
    sortOrder = parseInt(sortOrder);

    const favorites = await Favorite.getUserFavorites(req.user._id, page, limit, sortBy, sortOrder);
    const totalCount = await Favorite.getFavoritesCount(req.user._id);

    res.json({
      success: true,
      data: {
        favorites,
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
    console.error('Get favorites error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/favorites/check/:animeId
// @desc    Check if anime is favorited
// @access  Private
router.get('/check/:animeId', auth, async (req, res) => {
  try {
    const { animeId } = req.params;
    const favorite = await Favorite.isFavorited(req.user._id, animeId);

    res.json({
      success: true,
      data: {
        isFavorited: !!favorite,
        favorite: favorite || null
      }
    });
  } catch (error) {
    console.error('Check favorite error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/favorites/stats
// @desc    Get user's favorite statistics
// @access  Private
router.get('/stats', auth, async (req, res) => {
  try {
    const [totalCount, favoriteGenres, recommendationData] = await Promise.all([
      Favorite.getFavoritesCount(req.user._id),
      Favorite.getFavoriteGenres(req.user._id),
      Favorite.getRecommendationData(req.user._id)
    ]);

    res.json({
      success: true,
      data: {
        totalCount,
        favoriteGenres,
        recommendationData: recommendationData[0] || null
      }
    });
  } catch (error) {
    console.error('Get favorite stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/favorites
// @desc    Add anime to favorites
// @access  Private
router.post('/', [
  auth,
  body('animeId')
    .notEmpty()
    .withMessage('Anime ID is required'),
  body('animeTitle')
    .notEmpty()
    .withMessage('Anime title is required'),
  body('animeType')
    .optional()
    .isIn(['TV', 'Movie', 'OVA', 'ONA', 'Special', 'Music'])
    .withMessage('Anime type must be a valid type'),
  body('animeStatus')
    .optional()
    .isIn(['Completed', 'Ongoing', 'Upcoming', 'Unknown'])
    .withMessage('Anime status must be a valid status'),
  body('genres')
    .optional()
    .isArray()
    .withMessage('Genres must be an array'),
  body('personalRating')
    .optional()
    .isFloat({ min: 1, max: 10 })
    .withMessage('Personal rating must be between 1 and 10'),
  body('notes')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Notes cannot exceed 500 characters')
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
      animeType,
      animeStatus,
      animeRating,
      genres,
      personalRating,
      notes
    } = req.body;

    // Check if already favorited
    const existingFavorite = await Favorite.isFavorited(req.user._id, animeId);
    if (existingFavorite) {
      return res.status(400).json({
        success: false,
        message: 'Anime is already in favorites'
      });
    }

    const favorite = new Favorite({
      userId: req.user._id,
      animeId,
      animeTitle,
      animePoster: animePoster || null,
      animeType: animeType || 'TV',
      animeStatus: animeStatus || 'Unknown',
      animeRating: animeRating || null,
      genres: genres || [],
      personalRating: personalRating || null,
      notes: notes || null
    });

    await favorite.save();

    res.status(201).json({
      success: true,
      message: 'Anime added to favorites successfully',
      data: {
        favorite
      }
    });
  } catch (error) {
    console.error('Add favorite error:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Anime is already in favorites'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/favorites/:animeId
// @desc    Update favorite anime
// @access  Private
router.put('/:animeId', [
  auth,
  body('personalRating')
    .optional()
    .isFloat({ min: 1, max: 10 })
    .withMessage('Personal rating must be between 1 and 10'),
  body('notes')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Notes cannot exceed 500 characters'),
  body('genres')
    .optional()
    .isArray()
    .withMessage('Genres must be an array')
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

    const { animeId } = req.params;
    const { personalRating, notes, genres } = req.body;

    const updateData = {};
    if (personalRating !== undefined) updateData.personalRating = personalRating;
    if (notes !== undefined) updateData.notes = notes;
    if (genres !== undefined) updateData.genres = genres;

    const favorite = await Favorite.findOneAndUpdate(
      { userId: req.user._id, animeId },
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!favorite) {
      return res.status(404).json({
        success: false,
        message: 'Favorite not found'
      });
    }

    res.json({
      success: true,
      message: 'Favorite updated successfully',
      data: {
        favorite
      }
    });
  } catch (error) {
    console.error('Update favorite error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   DELETE /api/favorites/:animeId
// @desc    Remove anime from favorites
// @access  Private
router.delete('/:animeId', auth, async (req, res) => {
  try {
    const { animeId } = req.params;

    const deletedFavorite = await Favorite.findOneAndDelete({
      userId: req.user._id,
      animeId
    });

    if (!deletedFavorite) {
      return res.status(404).json({
        success: false,
        message: 'Favorite not found'
      });
    }

    res.json({
      success: true,
      message: 'Anime removed from favorites successfully'
    });
  } catch (error) {
    console.error('Remove favorite error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;