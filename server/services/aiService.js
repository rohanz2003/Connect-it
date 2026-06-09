const fetch = require('node-fetch');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

const SYSTEM_PROMPT = `You are a friendly, warm, and helpful AI assistant. Your personality:
- Talk like a human friend - be casual, friendly, and approachable
- Use natural conversational language, avoid being too formal or robotic
- Be enthusiastic and encouraging when helping users
- Show empathy and understanding

Your capabilities:
- Answer ALL types of questions: general knowledge, daily life advice, education
- Help with homework, coding, writing, essays, math, science, history, languages
- Provide explanations in simple terms first, then add details if needed
- Give practical, actionable advice
- Solve problems step-by-step when appropriate

Important guidelines:
- Always respond in the SAME LANGUAGE the user is using
- Be concise but thorough - balance brevity with completeness
- If you don't know something, admit it honestly
- Never make up facts or information
- Be encouraging and supportive, especially for students
- Use examples to make complex topics easier to understand
- Break down complex problems into simple steps

Remember: You're here to help users learn, solve problems, and get answers quickly!`;

async function getChatCompletion(messages) {
  try {
    if (!OPENROUTER_API_KEY) {
      throw new Error('OpenRouter API key not configured');
    }

    console.log('🤖 Calling OpenRouter API...');

    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
        'X-Title': 'Chat App AI Assistant',
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-3.1-8b-instruct:free',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages
        ],
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ OpenRouter API error:', response.status, errorText);
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    console.log('✅ AI response received:', content.substring(0, 100) + '...');
    return content;
  } catch (error) {
    console.error('❌ AI Service error:', error);
    throw error;
  }
}

async function streamChatCompletion(messages, onChunk, onComplete, onError) {
  try {
    if (!OPENROUTER_API_KEY) {
      throw new Error('OpenRouter API key not configured');
    }

    console.log('🤖 Starting streaming response...');

    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
        'X-Title': 'Chat App AI Assistant',
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-3.1-8b-instruct:free',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages
        ],
        stream: true,
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ OpenRouter API error:', response.status, errorText);
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    let fullResponse = '';
    let buffer = '';

    // Read the stream
    for await (const chunk of response.body) {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep the incomplete line in buffer

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;

        const data = trimmedLine.slice(6); // Remove 'data: ' prefix
        
        if (data === '[DONE]') {
          console.log('✅ Streaming complete. Total length:', fullResponse.length);
          onComplete(fullResponse);
          return fullResponse;
        }

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          
          if (content) {
            fullResponse += content;
            onChunk(content);
          }
        } catch (e) {
          // Ignore parse errors for malformed chunks
          console.warn('⚠️ Failed to parse chunk:', data.substring(0, 50));
        }
      }
    }

    // In case stream ends without [DONE]
    if (fullResponse) {
      console.log('✅ Stream ended. Total length:', fullResponse.length);
      onComplete(fullResponse);
    }
    
    return fullResponse;
  } catch (error) {
    console.error('❌ Stream error:', error);
    onError(error);
    throw error;
  }
}

module.exports = {
  getChatCompletion,
  streamChatCompletion,
};
