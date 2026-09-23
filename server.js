require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const { PDFParse } = require('pdf-parse');

const app = express();
const PORT = process.env.PORT || 3001;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

const MAX_CHARS_TO_MODEL = 40000; // keep prompts within a safe context size

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 } // 15 MB
});

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---- Health check ----
app.get('/api/health', (req, res) => {
  res.json({ ok: true, hasApiKey: Boolean(ANTHROPIC_API_KEY) });
});

// ---- Summarize raw pasted text ----
app.post('/api/summarize/text', async (req, res) => {
  try {
    const { text, options, sourceName } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Please paste some text to summarize.' });
    }
    const result = await summarizeText(text, options || {});
    result.sourceName = sourceName || 'Pasted text';
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

// ---- Summarize an uploaded file (PDF or .txt) ----
app.post('/api/summarize/file', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file was uploaded.' });
    }

    let text = '';
    const mime = req.file.mimetype;
    const name = req.file.originalname;

    if (mime === 'application/pdf' || name.toLowerCase().endsWith('.pdf')) {
      const parser = new PDFParse({ data: req.file.buffer });
      try {
        const parsed = await parser.getText();
        text = parsed.text;
      } finally {
        await parser.destroy();
      }
    } else if (mime.startsWith('text/') || name.toLowerCase().endsWith('.txt')) {
      text = req.file.buffer.toString('utf8');
    } else {
      return res.status(400).json({ error: 'Unsupported file type. Please upload a PDF or a .txt file.' });
    }

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Could not extract any text from this file.' });
    }

    let options = {};
    try { options = req.body.options ? JSON.parse(req.body.options) : {}; } catch (e) { /* ignore */ }

    const result = await summarizeText(text, options);
    result.sourceName = name;
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

// ---- Core summarization call ----
async function summarizeText(rawText, options) {
  if (!ANTHROPIC_API_KEY) {
    const err = new Error('Missing ANTHROPIC_API_KEY. Add it to your .env file (see .env.example).');
    err.status = 500;
    throw err;
  }

  const length = options.length || 'medium'; // short | medium | detailed
  const includeActionItems = Boolean(options.includeActionItems);

  let text = rawText.trim();
  let truncated = false;
  if (text.length > MAX_CHARS_TO_MODEL) {
    text = text.slice(0, MAX_CHARS_TO_MODEL);
    truncated = true;
  }

  const lengthGuide = {
    short: '2-3 sentences',
    medium: '4-6 sentences',
    detailed: '8-10 sentences'
  }[length] || '4-6 sentences';

  const systemPrompt = `You summarize documents, articles, and emails for busy readers (students and professionals).
Respond STRICTLY with valid JSON (no extra text, no backticks, no markdown), matching exactly this structure:

{
  "title": "short descriptive title for the content, a few words",
  "summary": "a plain-language summary, about ${lengthGuide}",
  "keyPoints": ["key point 1", "key point 2", "..."],
  "actionItems": ["action item 1", "..."]
}

Include 4 to 8 keyPoints, the most important facts or ideas, each a single concise sentence.
${includeActionItems
    ? 'Include actionItems: concrete next steps, deadlines, or requests found in the text. If there are none, return an empty array for actionItems.'
    : 'Return an empty array for actionItems.'}
Never invent facts that are not in the source text.`;

  const userPrompt = `Summarize the following content:\n\n${text}`;

  const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    })
  });

  if (!apiRes.ok) {
    const errText = await apiRes.text();
    console.error('Anthropic API error:', apiRes.status, errText);
    const err = new Error('Error calling the Anthropic API.');
    err.status = 502;
    err.details = errText;
    throw err;
  }

  const data = await apiRes.json();
  const textBlock = (data.content || []).find((c) => c.type === 'text');
  const rawModelText = textBlock ? textBlock.text : '';
  const cleaned = rawModelText.replace(/```json/gi, '').replace(/```/g, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (parseErr) {
    console.error('JSON parse error:', parseErr, 'Raw text:', rawModelText);
    const err = new Error('Could not parse the AI response as JSON.');
    err.status = 502;
    err.details = rawModelText;
    throw err;
  }

  parsed.truncated = truncated;
  return parsed;
}

function handleError(res, err) {
  console.error('Server error:', err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal server error.', details: err.details });
}

app.listen(PORT, () => {
  console.log(`BriefDesk is running at http://localhost:${PORT}`);
  if (!ANTHROPIC_API_KEY) {
    console.warn('⚠️  ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key.');
  }
});
