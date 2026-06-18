const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const ENV_PATH = path.join(__dirname, '.env');
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_TEAMS = Number(process.env.MAX_TEAMS || 300);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 14 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.mimetype || '')) {
      return cb(new Error('Chỉ hỗ trợ PNG, JPG/JPEG hoặc WEBP.'));
    }
    cb(null, true);
  }
});

app.use(express.json({ limit: '2mb' }));
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

function getModel() {
  return process.env.OPENAI_MODEL || 'gpt-4o-mini';
}

function hasSupabaseConfig() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
}

function updateEnvFile(updates) {
  const existing = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
  const remaining = new Map(Object.entries(updates));
  const lines = existing.split(/\r?\n/).map((line) => {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=/);
    if (!match || !remaining.has(match[1])) return line;

    const value = remaining.get(match[1]);
    remaining.delete(match[1]);
    return `${match[1]}=${value}`;
  });

  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  for (const [key, value] of remaining) lines.push(`${key}=${value}`);
  fs.writeFileSync(ENV_PATH, `${lines.join('\n')}\n`, 'utf8');
}

function normalizeTeam(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function safeJsonParse(text) {
  if (!text) return null;
  let cleaned = String(text).trim();
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first >= 0 && last > first) cleaned = cleaned.slice(first, last + 1);

  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function cleanTeams(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();

  return input
    .map((team, index) => ({
      no: String(team.no || index + 1).trim(),
      team: String(team.team || '').trim(),
      avatar: String(team.avatar || '').trim(),
      id: String(team.id || '').trim()
    }))
    .filter((team) => {
      if (!team.team) return false;
      const key = normalizeTeam(team.team);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normalizeAiResult(parsed, teams) {
  const result = {
    detected_text: '',
    selected_team: '',
    confidence: 0,
    candidates: [],
    reasoning_short: '',
    needs_review: true
  };

  if (!parsed || typeof parsed !== 'object') return result;

  result.detected_text = String(parsed.detected_text || '').slice(0, 300);
  result.reasoning_short = String(parsed.reasoning_short || '').slice(0, 500);
  result.confidence = Number(parsed.confidence || 0);
  if (!Number.isFinite(result.confidence)) result.confidence = 0;
  result.confidence = Math.max(0, Math.min(1, result.confidence));

  const selectedNorm = normalizeTeam(parsed.selected_team);
  const selected = teams.find((team) => normalizeTeam(team.team) === selectedNorm);
  if (selected) result.selected_team = selected.team;

  if (Array.isArray(parsed.candidates)) {
    result.candidates = parsed.candidates
      .slice(0, 5)
      .map((candidate) => {
        const name = typeof candidate === 'string'
          ? candidate
          : candidate.team || candidate.name || candidate.selected_team || '';
        const team = teams.find((entry) => normalizeTeam(entry.team) === normalizeTeam(name));
        if (!team) return null;

        const confidence = typeof candidate === 'string'
          ? 0
          : Number(candidate.confidence || candidate.score || 0);

        return {
          team: team.team,
          confidence: Math.max(0, Math.min(1, Number.isFinite(confidence) ? confidence : 0))
        };
      })
      .filter(Boolean);
  }

  result.needs_review = Boolean(parsed.needs_review);
  if (!result.selected_team || result.confidence < 0.72) result.needs_review = true;
  return result;
}

function buildPrompt(teams) {
  const teamList = teams
    .map((team, index) => {
      const meta = [
        `TEAM: ${team.team}`,
        team.id ? `HEADPICS_ID: ${team.id}` : '',
        team.avatar ? `AVATAR: ${team.avatar}` : ''
      ].filter(Boolean).join(' | ');
      return `${index + 1}. ${meta}`;
    })
    .join('\n');

  return `Bạn là công cụ nhận dạng logo team Free Fire/eSports.

Nhiệm vụ: nhìn logo được upload và chọn team phù hợp nhất trong DANH SÁCH TEAM.

Quy tắc:
- selected_team bắt buộc phải là đúng một tên team trong danh sách, hoặc chuỗi rỗng nếu không đủ chắc.
- Đọc chữ trên logo, kể cả chữ cách điệu, chữ bị méo, chữ viết tắt hoặc logo chỉ có biểu tượng.
- Tên đầy đủ có thể tương ứng với tên viết tắt. Ví dụ "Electric Over Power" có thể là "EOP".
- Cân nhắc lỗi OCR giữa O/0, I/1, S/5, B/8, E/F, J/I.
- Nếu không chắc, vẫn trả 3-5 ứng viên gần nhất và đặt needs_review=true.
- confidence là số từ 0 đến 1. Chỉ dùng confidence >= 0.72 khi khá chắc.
- Trả duy nhất JSON hợp lệ, không thêm markdown.

DANH SÁCH TEAM:
${teamList}

Schema JSON:
{
  "detected_text": "chữ đọc được trên logo nếu có",
  "selected_team": "tên team đúng y như danh sách hoặc rỗng",
  "confidence": 0.0,
  "candidates": [
    {"team": "TEAM1", "confidence": 0.0},
    {"team": "TEAM2", "confidence": 0.0},
    {"team": "TEAM3", "confidence": 0.0}
  ],
  "reasoning_short": "lý do ngắn bằng tiếng Việt",
  "needs_review": true
}`;
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    model: getModel(),
    has_api_key: Boolean(process.env.OPENAI_API_KEY),
    has_supabase: hasSupabaseConfig(),
    allow_save_key: process.env.NODE_ENV !== 'production'
  });
});

app.post('/api/save-key', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      error: 'Trong production hãy cấu hình OPENAI_API_KEY bằng App Settings, không lưu key qua web.'
    });
  }

  const apiKey = String(req.body.apiKey || '').trim();
  const model = String(req.body.model || getModel()).trim() || 'gpt-4o-mini';

  if (!apiKey || !apiKey.startsWith('sk-')) {
    return res.status(400).json({ error: 'API key không hợp lệ. Key thường bắt đầu bằng sk-.' });
  }

  updateEnvFile({
    OPENAI_API_KEY: apiKey,
    OPENAI_MODEL: model,
    PORT: String(PORT)
  });

  process.env.OPENAI_API_KEY = apiKey;
  process.env.OPENAI_MODEL = model;
  res.json({ ok: true, model, has_api_key: true });
});

app.post('/api/analyze-logo', upload.single('logo'), async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: 'Chưa có OPENAI_API_KEY. Khi deploy, đặt biến này trong App Settings.'
      });
    }

    if (!req.file) return res.status(400).json({ error: 'Thiếu file logo.' });

    let bodyTeams;
    try {
      bodyTeams = JSON.parse(req.body.teamsJson || '[]');
    } catch {
      return res.status(400).json({ error: 'teamsJson không phải JSON hợp lệ.' });
    }

    const teams = cleanTeams(bodyTeams);
    if (!teams.length) return res.status(400).json({ error: 'Danh sách team rỗng.' });
    if (teams.length > MAX_TEAMS) {
      return res.status(400).json({ error: `Tối đa ${MAX_TEAMS} team mỗi lần phân tích.` });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const dataUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

    const response = await client.chat.completions.create({
      model: getModel(),
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'Bạn là công cụ nhận dạng logo. Chỉ trả JSON hợp lệ theo schema người dùng yêu cầu.'
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: buildPrompt(teams) },
            { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } }
          ]
        }
      ]
    });

    const content = response.choices?.[0]?.message?.content || '';
    const parsed = safeJsonParse(content);
    const result = normalizeAiResult(parsed, teams);

    res.json({ ok: true, model: getModel(), result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || 'AI analyze failed.' });
  }
});

app.use((error, _req, res, _next) => {
  res.status(400).json({ error: error.message || 'Yêu cầu không hợp lệ.' });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`FF Logo AI Matcher running at http://localhost:${PORT}`);
    console.log(`Model: ${getModel()}`);
    console.log(process.env.OPENAI_API_KEY ? 'API key: configured' : 'API key: missing');
    console.log(hasSupabaseConfig() ? 'Supabase: configured' : 'Supabase: not configured');
  });
}

module.exports = app;
