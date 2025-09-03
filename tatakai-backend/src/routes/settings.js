const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { auth } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/settings
// @desc    Get user settings
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    const settings = {
      playback: {
        autoSkipIntros: user.profile?.preferences?.autoSkipIntros ?? true,
        autoSkipOutros: user.profile?.preferences?.autoSkipOutros ?? true,
        autoPlayNext: user.profile?.preferences?.autoPlayNext ?? true,
        videoQuality: user.profile?.preferences?.videoQuality ?? 'auto',
        subtitleLanguage: user.profile?.preferences?.subtitleLanguage ?? 'en'
      },
      display: {
        theme: user.profile?.preferences?.theme ?? 'dark',
        language: user.profile?.preferences?.language ?? 'en'
      },
      account: {
        syncHistory: user.profile?.preferences?.syncHistory ?? true,
        emailNotifications: user.profile?.preferences?.emailNotifications ?? true,
        parentalControls: user.profile?.preferences?.parentalControls ?? false
      },
      privacy: {
        profileVisibility: user.profile?.preferences?.profileVisibility ?? 'private',
        activitySharing: user.profile?.preferences?.activitySharing ?? false,
        analyticsOptOut: user.profile?.preferences?.analyticsOptOut ?? false
      }
    };

    res.json({
      success: true,
      data: { settings }
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/settings/playback
// @desc    Update playback settings
// @access  Private
router.put('/playback', [
  auth,
  body('autoSkipIntros').optional().isBoolean(),
  body('autoSkipOutros').optional().isBoolean(),
  body('autoPlayNext').optional().isBoolean(),
  body('videoQuality').optional().isIn(['auto', '1080p', '720p', '480p']),
  body('subtitleLanguage').optional().isIn(['en', 'ja', 'es', 'fr', 'de', 'off'])
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

    const updateData = {};
    const { autoSkipIntros, autoSkipOutros, autoPlayNext, videoQuality, subtitleLanguage } = req.body;

    if (autoSkipIntros !== undefined) updateData['profile.preferences.autoSkipIntros'] = autoSkipIntros;
    if (autoSkipOutros !== undefined) updateData['profile.preferences.autoSkipOutros'] = autoSkipOutros;
    if (autoPlayNext !== undefined) updateData['profile.preferences.autoPlayNext'] = autoPlayNext;
    if (videoQuality !== undefined) updateData['profile.preferences.videoQuality'] = videoQuality;
    if (subtitleLanguage !== undefined) updateData['profile.preferences.subtitleLanguage'] = subtitleLanguage;

    await User.findByIdAndUpdate(
      req.user._id,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Playback settings updated successfully'
    });
  } catch (error) {
    console.error('Update playback settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/settings/display
// @desc    Update display settings
// @access  Private
router.put('/display', [
  auth,
  body('theme').optional().isIn(['light', 'dark', 'system']),
  body('language').optional().isIn(['en', 'ja', 'es', 'fr', 'de'])
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

    const updateData = {};
    const { theme, language } = req.body;

    if (theme !== undefined) updateData['profile.preferences.theme'] = theme;
    if (language !== undefined) updateData['profile.preferences.language'] = language;

    await User.findByIdAndUpdate(
      req.user._id,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Display settings updated successfully'
    });
  } catch (error) {
    console.error('Update display settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/settings/account
// @desc    Update account settings
// @access  Private
router.put('/account', [
  auth,
  body('syncHistory').optional().isBoolean(),
  body('emailNotifications').optional().isBoolean(),
  body('parentalControls').optional().isBoolean()
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

    const updateData = {};
    const { syncHistory, emailNotifications, parentalControls } = req.body;

    if (syncHistory !== undefined) updateData['profile.preferences.syncHistory'] = syncHistory;
    if (emailNotifications !== undefined) updateData['profile.preferences.emailNotifications'] = emailNotifications;
    if (parentalControls !== undefined) updateData['profile.preferences.parentalControls'] = parentalControls;

    await User.findByIdAndUpdate(
      req.user._id,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Account settings updated successfully'
    });
  } catch (error) {
    console.error('Update account settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/settings/privacy
// @desc    Update privacy settings
// @access  Private
router.put('/privacy', [
  auth,
  body('profileVisibility').optional().isIn(['public', 'private']),
  body('activitySharing').optional().isBoolean(),
  body('analyticsOptOut').optional().isBoolean()
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

    const updateData = {};
    const { profileVisibility, activitySharing, analyticsOptOut } = req.body;

    if (profileVisibility !== undefined) updateData['profile.preferences.profileVisibility'] = profileVisibility;
    if (activitySharing !== undefined) updateData['profile.preferences.activitySharing'] = activitySharing;
    if (analyticsOptOut !== undefined) updateData['profile.preferences.analyticsOptOut'] = analyticsOptOut;

    await User.findByIdAndUpdate(
      req.user._id,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Privacy settings updated successfully'
    });
  } catch (error) {
    console.error('Update privacy settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/settings/clear-cache
// @desc    Clear user cache and temporary data
// @access  Private
router.post('/clear-cache', auth, async (req, res) => {
  try {
    // Clear user's temporary data, cache entries, etc.
    // This could include clearing watch history cache, search history, etc.
    
    const user = await User.findById(req.user._id);
    
    // Reset certain cached preferences to defaults if needed
    const resetData = {
      'profile.cache.lastClearDate': new Date(),
      'profile.cache.searchHistory': [],
      'profile.cache.recentlyViewed': []
    };

    await User.findByIdAndUpdate(
      req.user._id,
      { $set: resetData },
      { new: true }
    );

    res.json({
      success: true,
      message: 'Cache cleared successfully'
    });
  } catch (error) {
    console.error('Clear cache error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear cache'
    });
  }
});

// @route   GET /api/settings/export
// @desc    Export user data
// @access  Private
router.get('/export', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('watchHistory favorites');
    
    const exportData = {
      exportDate: new Date(),
      user: {
        username: user.username,
        email: user.email,
        profile: user.profile,
        createdAt: user.createdAt
      },
      watchHistory: user.watchHistory || [],
      favorites: user.favorites || []
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=tatakai-export-${user.username}-${Date.now()}.json`);
    res.json({
      success: true,
      data: exportData
    });
  } catch (error) {
    console.error('Export data error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export data'
    });
  }
});

module.exports = router;