const geminiService = require('../services/geminiService');

/**
 * Generate content based on title
 */
exports.generateContent = async (req, res) => {
  try {
    const { title, platform = 'instagram', options = {} } = req.body;

    if (!title) {
      return res.status(400).json({
        success: false,
        message: 'Title is required',
      });
    }

    console.log('🤖 [AI] Generate content request:', { title, platform });

    const result = await geminiService.generateContent(title, platform, options);

    res.json({
      success: true,
      message: 'Content generated successfully',
      data: result,
    });
  } catch (error) {
    console.error('❌ [AI] Generate content error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating content',
      error: error.message,
    });
  }
};

/**
 * Generate multiple content variations
 */
exports.generateVariations = async (req, res) => {
  try {
    const { title, platform = 'instagram', count = 3, options = {} } = req.body;

    if (!title) {
      return res.status(400).json({
        success: false,
        message: 'Title is required',
      });
    }

    if (count > 5) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 5 variations allowed',
      });
    }

    console.log('🤖 [AI] Generate variations request:', { title, platform, count });

    const variations = await geminiService.generateVariations(title, platform, count, options);

    res.json({
      success: true,
      message: 'Variations generated successfully',
      data: { variations },
    });
  } catch (error) {
    console.error('❌ [AI] Generate variations error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating variations',
      error: error.message,
    });
  }
};

/**
 * Improve existing content
 */
exports.improveContent = async (req, res) => {
  try {
    const { content, platform = 'instagram', improvementType = 'general' } = req.body;

    if (!content) {
      return res.status(400).json({
        success: false,
        message: 'Content is required',
      });
    }

    console.log('🤖 [AI] Improve content request:', { platform, improvementType });

    const improvedContent = await geminiService.improveContent(content, platform, improvementType);

    res.json({
      success: true,
      message: 'Content improved successfully',
      data: {
        content: improvedContent,
        improvementType,
      },
    });
  } catch (error) {
    console.error('❌ [AI] Improve content error:', error);
    res.status(500).json({
      success: false,
      message: 'Error improving content',
      error: error.message,
    });
  }
};

/**
 * Generate hashtags for content
 */
exports.generateHashtags = async (req, res) => {
  try {
    const { content, platform = 'instagram', count = 10 } = req.body;

    if (!content) {
      return res.status(400).json({
        success: false,
        message: 'Content is required',
      });
    }

    console.log('🤖 [AI] Generate hashtags request:', { platform, count });

    const hashtags = await geminiService.generateHashtags(content, platform, count);

    res.json({
      success: true,
      message: 'Hashtags generated successfully',
      data: { hashtags },
    });
  } catch (error) {
    console.error('❌ [AI] Generate hashtags error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating hashtags',
      error: error.message,
    });
  }
};

module.exports = exports;
