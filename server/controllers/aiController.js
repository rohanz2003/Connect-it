const AIConversation = require('../models/AIConversation');
const { getChatCompletion } = require('../services/aiService');

// Get AI conversation history for a user
exports.getConversation = async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const conversation = await AIConversation.findOne({ userId })
      .sort({ lastMessageAt: -1 });

    if (!conversation) {
      return res.json({ success: true, messages: [] });
    }

    res.json({ 
      success: true, 
      messages: conversation.messages || [] 
    });
  } catch (error) {
    console.error('Error fetching AI conversation:', error);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
};

// Send message to AI and get response
exports.sendMessage = async (req, res) => {
  try {
    const { userId, message } = req.body;

    if (!userId || !message) {
      return res.status(400).json({ error: 'userId and message are required' });
    }

    // Get or create conversation
    let conversation = await AIConversation.findOne({ userId });
    
    if (!conversation) {
      conversation = new AIConversation({
        userId,
        messages: [],
      });
    }

    // Add user message
    conversation.messages.push({
      role: 'user',
      content: message,
      timestamp: new Date(),
    });

    // Prepare messages for AI (last 10 messages for context)
    const recentMessages = conversation.messages.slice(-10).map(m => ({
      role: m.role,
      content: m.content,
    }));

    // Get AI response
    const aiResponse = await getChatCompletion(recentMessages);

    // Add AI response
    conversation.messages.push({
      role: 'assistant',
      content: aiResponse,
      timestamp: new Date(),
    });

    conversation.lastMessageAt = new Date();
    await conversation.save();

    res.json({
      success: true,
      response: aiResponse,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Error in AI sendMessage:', error);
    
    // Return user-friendly error
    let errorMessage = 'Sorry, I encountered an error. Please try again.';
    
    if (error.message.includes('API key')) {
      errorMessage = 'AI service configuration error. Please contact support.';
    } else if (error.message.includes('API error')) {
      errorMessage = 'AI service temporarily unavailable. Please try again in a moment.';
    }

    res.status(500).json({ 
      error: errorMessage,
      details: error.message 
    });
  }
};

// Clear AI conversation history
exports.clearConversation = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    await AIConversation.deleteOne({ userId });

    res.json({ success: true, message: 'Conversation cleared' });
  } catch (error) {
    console.error('Error clearing AI conversation:', error);
    res.status(500).json({ error: 'Failed to clear conversation' });
  }
};
