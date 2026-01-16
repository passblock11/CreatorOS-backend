const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

class GeminiService {
  constructor() {
    this.model = genAI.getGenerativeModel({ model: 'gemini-pro' });
  }

  /**
   * Generate social media content based on title and platform
   */
  async generateContent(title, platform = 'instagram', options = {}) {
    try {
      console.log('🤖 [Gemini] Generating content for:', { title, platform });

      const { tone = 'engaging', length = 'medium', includeHashtags = true, includeEmojis = true } = options;

      // Build the prompt based on platform and options
      const prompt = this.buildPrompt(title, platform, { tone, length, includeHashtags, includeEmojis });

      // Generate content
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const generatedContent = response.text();

      console.log('✅ [Gemini] Content generated successfully');

      return {
        content: generatedContent.trim(),
        metadata: {
          platform,
          tone,
          length,
          includeHashtags,
          includeEmojis,
        },
      };
    } catch (error) {
      console.error('❌ [Gemini] Error generating content:', error);
      throw new Error(`Failed to generate content: ${error.message}`);
    }
  }

  /**
   * Build prompt for content generation
   */
  buildPrompt(title, platform, options) {
    const { tone, length, includeHashtags, includeEmojis } = options;

    // Platform-specific guidelines
    const platformGuidelines = {
      instagram: {
        maxLength: length === 'short' ? '100 words' : length === 'medium' ? '150 words' : '200 words',
        style: 'Visual storytelling with engaging captions',
        hashtagCount: includeHashtags ? '5-10 relevant hashtags' : 'no hashtags',
      },
      snapchat: {
        maxLength: length === 'short' ? '50 words' : length === 'medium' ? '80 words' : '120 words',
        style: 'Short, punchy, and authentic',
        hashtagCount: includeHashtags ? '3-5 hashtags' : 'no hashtags',
      },
      both: {
        maxLength: length === 'short' ? '80 words' : length === 'medium' ? '120 words' : '150 words',
        style: 'Versatile content that works on multiple platforms',
        hashtagCount: includeHashtags ? '5-8 hashtags' : 'no hashtags',
      },
    };

    const guidelines = platformGuidelines[platform] || platformGuidelines.instagram;

    const prompt = `
You are a professional social media content creator. Create engaging ${platform} content based on the following title:

Title: "${title}"

Requirements:
- Platform: ${platform.toUpperCase()}
- Tone: ${tone} (e.g., friendly, professional, humorous, inspirational)
- Length: ${guidelines.maxLength}
- Style: ${guidelines.style}
${includeEmojis ? '- Include relevant emojis to make it engaging' : '- Do not use emojis'}
${includeHashtags ? `- Add ${guidelines.hashtagCount} at the end` : '- Do not include hashtags'}

Instructions:
1. Write a compelling caption that captures attention
2. Make it authentic and relatable
3. Include a call-to-action if appropriate
4. Keep the content focused and engaging
5. Ensure it's optimized for ${platform}

Generate the content now:
`.trim();

    return prompt;
  }

  /**
   * Generate multiple content variations
   */
  async generateVariations(title, platform, count = 3, options = {}) {
    try {
      console.log('🤖 [Gemini] Generating variations:', { title, platform, count });

      const variations = [];

      for (let i = 0; i < count; i++) {
        const result = await this.generateContent(title, platform, options);
        variations.push(result);
        
        // Small delay to avoid rate limiting
        if (i < count - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      console.log(`✅ [Gemini] Generated ${count} variations`);

      return variations;
    } catch (error) {
      console.error('❌ [Gemini] Error generating variations:', error);
      throw new Error(`Failed to generate variations: ${error.message}`);
    }
  }

  /**
   * Improve existing content
   */
  async improveContent(existingContent, platform = 'instagram', improvementType = 'general') {
    try {
      console.log('🤖 [Gemini] Improving content for:', platform);

      const improvementPrompts = {
        general: 'Improve and enhance this content while keeping the core message',
        engagement: 'Make this content more engaging and interactive',
        professional: 'Make this content more professional and polished',
        casual: 'Make this content more casual and relatable',
        short: 'Shorten this content while keeping the key points',
      };

      const prompt = `
${improvementPrompts[improvementType] || improvementPrompts.general}

Platform: ${platform.toUpperCase()}
Current Content:
"${existingContent}"

Please provide an improved version:
`.trim();

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const improvedContent = response.text();

      console.log('✅ [Gemini] Content improved successfully');

      return improvedContent.trim();
    } catch (error) {
      console.error('❌ [Gemini] Error improving content:', error);
      throw new Error(`Failed to improve content: ${error.message}`);
    }
  }

  /**
   * Generate hashtags for content
   */
  async generateHashtags(content, platform = 'instagram', count = 10) {
    try {
      console.log('🤖 [Gemini] Generating hashtags');

      const prompt = `
Generate ${count} relevant and trending hashtags for the following ${platform} content:

"${content}"

Requirements:
- Mix of popular and niche hashtags
- Relevant to the content
- Platform-appropriate
- Include both broad and specific tags

Return only the hashtags, separated by spaces, starting with #:
`.trim();

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const hashtags = response.text();

      console.log('✅ [Gemini] Hashtags generated successfully');

      return hashtags.trim();
    } catch (error) {
      console.error('❌ [Gemini] Error generating hashtags:', error);
      throw new Error(`Failed to generate hashtags: ${error.message}`);
    }
  }
}

module.exports = new GeminiService();
