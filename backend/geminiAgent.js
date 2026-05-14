'use strict';

const DEFAULT_MODEL = process.env.GROP_ENDPOINT?.includes('/openai/') ? 'gpt-4o-mini' : 'gemini-2.5-flash';
const API_ENDPOINT = process.env.GROP_ENDPOINT || process.env.GEMINI_ENDPOINT || 'https://generativelanguage.googleapis.com/v1beta/models';

function redactSecrets(text) {
  return String(text || '')
    .replace(/github_pat_[A-Za-z0-9_]+/g, 'github_pat_***')
    .replace(/ghp_[A-Za-z0-9_]+/g, 'ghp_***')
    .replace(/AIza[0-9A-Za-z_-]+/g, 'AIza***')
    .replace(/https:\/\/([^:\s]+):([^@\s]+)@/g, 'https://$1:***@');
}

function compactLogLines(rows, maxLines = 70, maxChars = 6000) {
  const lines = rows
    .slice(-maxLines)
    .map(row => `${row.level || 'info'}: ${row.message || ''}`);

  let text = redactSecrets(lines.join('\n'));
  if (text.length > maxChars) text = text.slice(text.length - maxChars);
  return text;
}

function parseModelText(payload) {
  if (payload?.choices?.[0]?.message?.content) {
    return payload.choices[0].message.content.trim();
  }
  const parts = payload?.candidates?.[0]?.content?.parts || [];
  return parts.map(part => part.text || '').join('\n').trim();
}

async function analyzeDeploymentFailure({ logs, errorMessage }) {
  const apiKey = process.env.GROP_API_KEY;
  if (!apiKey) return null;

  const model = process.env.GROP_MODEL || DEFAULT_MODEL;
  const logText = compactLogLines(logs);
  const prompt = [
    'Deployment failed. Diagnose with minimum tokens.',
    'Return JSON only with keys: cause, fix, retry.',
    'Rules: be concise; no markdown; do not reveal secrets; if exact fix is unknown, say what to inspect.',
    `Final error: ${redactSecrets(errorMessage)}`,
    'Log tail:',
    logText,
  ].join('\n');

  const isOpenAI = API_ENDPOINT.includes('/openai/');
  const fetchUrl = isOpenAI ? API_ENDPOINT : `${API_ENDPOINT}/${encodeURIComponent(model)}:generateContent`;
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
  if (!isOpenAI) {
    headers['x-goog-api-key'] = apiKey;
    delete headers.Authorization;
  }

  const body = isOpenAI
    ? {
        model,
        messages: [
          { role: 'system', content: 'You are a terse DevOps deployment repair agent.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 220,
      }
    : {
        systemInstruction: {
          parts: [{ text: 'You are a terse DevOps deployment repair agent.' }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 220,
          responseMimeType: 'application/json',
        },
      };

  const response = await fetch(fetchUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || payload?.error?.type || `Grop HTTP ${response.status}`;
    throw new Error(message);
  }

  const text = parseModelText(payload);
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (_) {
    return { cause: 'Grop returned non-JSON guidance.', fix: text.slice(0, 600), retry: 'Review the guidance and retry.' };
  }
}

module.exports = { analyzeDeploymentFailure };
