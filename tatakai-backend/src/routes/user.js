const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { auth } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/user/profile
// @desc    Get user profile
// @access  Private
router.get('/profile', auth, async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        user: {
          id: req.user._id,
          username: req.user.username,
          email: req.user.email,
          profile: req.user.profile,
          isEmailVerified: req.user.isEmailVerified,
          lastLoginAt: req.user.lastLoginAt,
          createdAt: req.user.createdAt
        }
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/user/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', [
  auth,
  body('displayName')
    .optional()
    .isLength({ max: 50 })
    .withMessage('Display name cannot exceed 50 characters'),
  body('bio')
    .optional()
    .isLength({ max: 200 })
    .withMessage('Bio cannot exceed 200 characters'),
  body('preferences.theme')
    .optional()
    .isIn(['light', 'dark', 'system'])
    .withMessage('Theme must be light, dark, or system'),
  body('preferences.language')
    .optional()
    .isIn(['en', 'ja', 'es', 'fr', 'de'])
    .withMessage('Language must be a supported language code'),
  body('preferences.autoPlay')
    .optional()
    .isBoolean()
    .withMessage('AutoPlay must be a boolean'),
  body('preferences.autoSkip')
    .optional()
    .isBoolean()
    .withMessage('AutoSkip must be a boolean')
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

    const { displayName, bio, avatar, preferences } = req.body;
    const updateData = {};

    // Update profile fields
    if (displayName !== undefined) {
      updateData['profile.displayName'] = displayName;
    }
    if (bio !== undefined) {
      updateData['profile.bio'] = bio;
    }
    if (avatar !== undefined) {
      updateData['profile.avatar'] = avatar;
    }

    // Update preferences
    if (preferences) {
      if (preferences.theme !== undefined) {
        updateData['profile.preferences.theme'] = preferences.theme;
      }
      if (preferences.language !== undefined) {
        updateData['profile.preferences.language'] = preferences.language;
      }
      if (preferences.autoPlay !== undefined) {
        updateData['profile.preferences.autoPlay'] = preferences.autoPlay;
      }
      if (preferences.autoSkip !== undefined) {
        updateData['profile.preferences.autoSkip'] = preferences.autoSkip;
      }
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          profile: user.profile,
          isEmailVerified: user.isEmailVerified,
          lastLoginAt: user.lastLoginAt,
          createdAt: user.createdAt
        }
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/user/password
// @desc    Change user password
// @access  Private
router.put('/password', [
  auth,
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters long')
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

    const { currentPassword, newPassword } = req.body;

    // Get user with password
    const user = await User.findById(req.user._id).select('+password');

    // Verify current password
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    console.error('Update password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   DELETE /api/user/account
// @desc    Deactivate user account
// @access  Private
router.delete('/account', auth, async (req, res) => {
  try {
    await User.findByIdAndUpdate(
      req.user._id,
      { isActive: false },
      { new: true }
    );

    res.json({
      success: true,
      message: 'Account deactivated successfully'
    });
  } catch (error) {
    console.error('Deactivate account error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;