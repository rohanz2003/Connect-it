const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

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

async function getChatCompletion(messages, stream = false) {
  try {
    if (!OPENROUTER_API_KEY) {
      throw new Error('OpenRouter API key not configured');
    }

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
        stream: stream,
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenRouter API error:', response.status, errorText);
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    if (stream) {
      return response.body;
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error('AI Service error:', error);
    throw error;
  }
}

async function streamChatCompletion(messages, onChunk, onComplete, onError) {
  try {
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
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const reader = response.body;
    let fullResponse = '';

    for await (const chunk of reader) {
      const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          
          if (data === '[DONE]') {
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
            // Ignore parse errors for streaming chunks
          }
        }
      }
    }

    onComplete(fullResponse);
    return fullResponse;
  } catch (error) {
    console.error('Stream error:', error);
    onError(error);
    throw error;
  }
}

module.exports = {
  getChatCompletion,
  streamChatCompletion,
};
