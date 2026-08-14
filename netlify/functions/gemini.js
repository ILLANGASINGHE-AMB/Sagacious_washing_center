// Netlify Serverless Function to proxy Gemini API calls securely
// Key is stored in process.env.GEMINI_API_KEY on the server side

exports.handler = async function (event, context) {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'GEMINI_API_KEY environment variable is not configured on Netlify server.' })
    };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const promptText = payload.promptText || payload.prompt;

    if (!promptText) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing promptText in request body.' })
      };
    }

    const models = ["gemini-1.5-flash", "gemini-1.5-pro"];
    let lastError = null;

    for (const model of models) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }]
          })
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error?.message || `HTTP ${response.status}`);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error('Empty response from model.');

        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text })
        };
      } catch (err) {
        console.warn(`Gemini server proxy model ${model} failed:`, err.message);
        lastError = err;
      }
    }

    return {
      statusCode: 502,
      body: JSON.stringify({ error: `All Gemini models failed: ${lastError ? lastError.message : 'Unknown error'}` })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || 'Internal Server Error' })
    };
  }
};
