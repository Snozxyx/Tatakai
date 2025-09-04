const express = require('express');
const { query, validationResult } = require('express-validator');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

const HIANIME_API_BASE = process.env.HIANIME_API_BASE_URL || 'https://aniwatch-api-taupe-eight.vercel.app/api/v2/hianime';
const ANISKIP_API_BASE = process.env.ANISKIP_API_BASE_URL || 'https://api.aniskip.com/v2';

// Helper function to make API requests
const fetchFromAPI = async (url, options = {}) => {
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Tatakai-Backend/1.0',
        ...options.headers
      },
      ...options
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('API fetch error:', error);
    throw error;
  }
};

// @route   GET /api/anime/home
// @desc    Get home page anime data
// @access  Public (with optional auth for personalization)
router.get('/home', optionalAuth, async (req, res) => {
  try {
    const data = await fetchFromAPI(`${HIANIME_API_BASE}/home`);
    
    res.json({
      success: true,
      data: data.data || data,
      user: req.user ? {
        id: req.user._id,
        username: req.user.username
      } : null
    });
  } catch (error) {
    console.error('Get home data error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch home data'
    });
  }
});

// @route   GET /api/anime/search
// @desc    Search anime
// @access  Public
router.get('/search', [
  query('q')
    .notEmpty()
    .withMessage('Search query is required'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer')
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

    const { q, page = 1, ...filters } = req.query;
    const queryParams = new URLSearchParams({
      q,
      page,
      ...filters
    });

    const data = await fetchFromAPI(`${HIANIME_API_BASE}/search?${queryParams}`);
    
    res.json({
      success: true,
      data: data.data || data
    });
  } catch (error) {
    console.error('Search anime error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search anime'
    });
  }
});

// @route   GET /api/anime/info/:id
// @desc    Get anime information
// @access  Public (with optional auth for user data)
router.get('/info/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const data = await fetchFromAPI(`${HIANIME_API_BASE}/anime/${id}`);
    
    // If user is authenticated, add user-specific data
    let userSpecificData = null;
    if (req.user) {
      const [WatchHistory, Favorite] = await Promise.all([
        require('../models/WatchHistory'),
        require('../models/Favorite')
      ]);
      
      const [watchHistory, favorite] = await Promise.all([
        WatchHistory.getAnimeProgress(req.user._id, id),
        Favorite.isFavorited(req.user._id, id)
      ]);

      userSpecificData = {
        watchHistory,
        isFavorited: !!favorite,
        favorite: favorite || null
      };
    }
    
    res.json({
      success: true,
      data: data.data || data,
      userSpecificData
    });
  } catch (error) {
    console.error('Get anime info error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch anime information'
    });
  }
});

// @route   GET /api/anime/episodes/:id
// @desc    Get anime episodes
// @access  Public
router.get('/episodes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = await fetchFromAPI(`${HIANIME_API_BASE}/anime/${id}/episodes`);
    
    res.json({
      success: true,
      data: data.data || data
    });
  } catch (error) {
    console.error('Get episodes error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch episodes'
    });
  }
});

// @route   GET /api/anime/servers/:episodeId
// @desc    Get episode servers
// @access  Public
router.get('/servers/:episodeId', async (req, res) => {
  try {
    const { episodeId } = req.params;
    const data = await fetchFromAPI(`${HIANIME_API_BASE}/episode/servers?animeEpisodeId=${episodeId}`);
    
    res.json({
      success: true,
      data: data.data || data
    });
  } catch (error) {
    console.error('Get servers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch episode servers'
    });
  }
});

// @route   GET /api/anime/sources/:episodeId
// @desc    Get episode sources
// @access  Public
router.get('/sources/:episodeId', [
  query('server')
    .optional()
    .notEmpty()
    .withMessage('Server must not be empty'),
  query('category')
    .optional()
    .isIn(['sub', 'dub', 'raw'])
    .withMessage('Category must be sub, dub, or raw')
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

    const { episodeId } = req.params;
    const { server, category } = req.query;
    
    const queryParams = new URLSearchParams({
      animeEpisodeId: episodeId,
      ...(server && { server }),
      ...(category && { category })
    });

    const data = await fetchFromAPI(`${HIANIME_API_BASE}/episode/sources?${queryParams}`);
    
    res.json({
      success: true,
      data: data.data || data
    });
  } catch (error) {
    console.error('Get sources error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch episode sources'
    });
  }
});

// @route   GET /api/anime/skip-times/:malId/:episode
// @desc    Get intro/outro skip times from AniSkip
// @access  Public
router.get('/skip-times/:malId/:episode', [
  query('episodeLength')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Episode length must be a positive integer'),
  query('types')
    .optional()
    .custom((value) => {
      const validTypes = ['op', 'ed', 'mixed-op', 'mixed-ed', 'recap'];
      const types = Array.isArray(value) ? value : [value];
      return types.every(type => validTypes.includes(type));
    })
    .withMessage('Types must be valid skip types')
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

    const { malId, episode } = req.params;
    const { episodeLength, types = ['op', 'ed'] } = req.query;
    
    const queryParams = new URLSearchParams();
    if (episodeLength) queryParams.append('episodeLength', episodeLength);
    
    // Handle types parameter (can be array or single value)
    const typesArray = Array.isArray(types) ? types : [types];
    typesArray.forEach(type => queryParams.append('types', type));

    const data = await fetchFromAPI(`${ANISKIP_API_BASE}/skip-times/${malId}/${episode}?${queryParams}`);
    
    res.json(data);
  } catch (error) {
    console.error('Get skip times error:', error);
    // Return empty response for skip times errors to not break playback
    res.json({
      found: false,
      results: [],
      message: 'Skip times not available',
      statusCode: 404
    });
  }
});

// @route   GET /api/anime/category/:category
// @desc    Get anime by category
// @access  Public
router.get('/category/:category', [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer')
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

    const { category } = req.params;
    const { page = 1 } = req.query;
    
    const data = await fetchFromAPI(`${HIANIME_API_BASE}/${category}?page=${page}`);
    
    res.json({
      success: true,
      data: data.data || data
    });
  } catch (error) {
    console.error('Get category error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch category data'
    });
  }
});

// @route   GET /api/anime/genre/:genre
// @desc    Get anime by genre
// @access  Public
router.get('/genre/:genre', [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer')
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

    const { genre } = req.params;
    const { page = 1 } = req.query;
    
    const data = await fetchFromAPI(`${HIANIME_API_BASE}/genre/${genre}?page=${page}`);
    
    res.json({
      success: true,
      data: data.data || data
    });
  } catch (error) {
    console.error('Get genre error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch genre data'
    });
  }
});

module.exports = router;