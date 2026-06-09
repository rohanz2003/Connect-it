const AIConversation = require('../models/AIConversation');
const { streamChatCompletion } = require('../services/aiService');

module.exports = (io, socket) => {
  // Handle AI message with streaming
  socket.on('ai-message', async (data) => {
    const { userId, message, tempId } = data;

    if (!userId || !message) {
      socket.emit('ai-error', { 
        error: 'Invalid request',
        tempId 
      });
      return;
    }

    try {
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

      // Emit that AI is typing
      socket.emit('ai-typing', { userId });

      let fullResponse = '';
      let chunkCount = 0;

      // Stream AI response
      await streamChatCompletion(
        recentMessages,
        // onChunk
        (chunk) => {
          fullResponse += chunk;
          chunkCount++;
          
          // Emit chunk to client
          socket.emit('ai-stream-chunk', {
            chunk,
            tempId,
            isComplete: false,
          });
        },
        // onComplete
        async (finalResponse) => {
          // Add AI response to conversation
          conversation.messages.push({
            role: 'assistant',
            content: finalResponse,
            timestamp: new Date(),
          });

          conversation.lastMessageAt = new Date();
          await conversation.save();

          // Emit completion
          socket.emit('ai-stream-complete', {
            response: finalResponse,
            tempId,
            timestamp: new Date(),
          });

          console.log(`✅ AI response completed for ${userId}: ${chunkCount} chunks, ${finalResponse.length} chars`);
        },
        // onError
        (error) => {
          console.error('AI streaming error:', error);
          socket.emit('ai-error', {
            error: 'Sorry, I encountered an error. Please try again.',
            tempId,
          });
        }
      );

    } catch (error) {
      console.error('AI message error:', error);
      
      let errorMessage = 'Sorry, I encountered an error. Please try again.';
      
      if (error.message.includes('API key')) {
        errorMessage = 'AI service configuration error. Please contact support.';
      } else if (error.message.includes('API error')) {
        errorMessage = 'AI service temporarily unavailable. Please try again in a moment.';
      }

      socket.emit('ai-error', {
        error: errorMessage,
        tempId,
      });
    }
  });

  // Handle clear AI conversation
  socket.on('clear-ai-conversation', async (data) => {
    const { userId } = data;

    if (!userId) {
      socket.emit('ai-error', { error: 'Invalid request' });
      return;
    }

    try {
      await AIConversation.deleteOne({ userId });
      socket.emit('ai-conversation-cleared', { success: true });
      console.log(`🗑️ AI conversation cleared for ${userId}`);
    } catch (error) {
      console.error('Error clearing AI conversation:', error);
      socket.emit('ai-error', { error: 'Failed to clear conversation' });
    }
  });
};
