const DEFAULT_AVATARS = [
  ['Andrew', '902000006'], ['Kelly', '902000007'], ['Olivia', '902000008'], ['Ford', '902000009'],
  ['Nikita', '902000010'], ['Misha', '902000012'], ['Maxim', '902000030'], ['Kla', '902000062'],
  ['Paloma', '902000080'], ['Miguel', '902000081'], ['Caroline', '902000096'], ['Antonio', '902000102'],
  ['Wukong', '902000110'], ['Moco', '902000119'], ['Hayato', '902000130'], ['Laura', '902000167'],
  ['Rafael', '902000182'], ['A124', '902000195'], ['Alok', '902000212'], ['Chrono', '902000247'],
  ['Skyler', '902000278'], ['D-Bee', '902000303'], ['K', '902000227'], ['Xayne', '902000289']
];

const SAMPLE = `1 VTT EP
2 NFV
3 TL
4 EOP
5 NBGA
6 ASTR
7 TTE
8 NAE
9 GOD
10 HEAVY
11 WAG
12 HQ`;

const $ = (id) => document.getElementById(id);

let teams = [];
let files = [];
let unmatched = [];
let hasApiKey = false;
let allowSaveKey = false;
let learning = loadLearning();

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function stripDecor(value) {
  return String(value || '')
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, ' ')
    .replace(/[★☆✓✔✕✖●◆◇■]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
  }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

function uid() {
  return `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function parseTeams(text, append = false) {
  const rows = String(text || '').split(/\r?\n/).map((row) => row.trim()).filter(Boolean);
  const parsed = [];
  const base = append ? teams.length : 0;

  for (const raw of rows) {
    let line = stripDecor(raw);
    if (!line || /^(NO|STT)\b/i.test(line)) continue;

    let no = '';
    let team = '';
    let avatar = '';
    let id = '';

    const columns = line.split(/\t|\||,|;/).map((part) => stripDecor(part)).filter(Boolean);
    if (columns.length >= 3) {
      if (/^\d+$/.test(columns[0])) {
        no = columns[0];
        team = columns[1];
        avatar = columns[2] || '';
        id = columns[3] || '';
      } else {
        team = columns[0];
        avatar = columns[1] || '';
        id = columns[2] || '';
      }
    } else {
      const match = line.match(/^(\d+)\s+(.+)$/);
      if (match) {
        no = match[1];
        team = match[2];
      } else {
        team = line;
      }
    }

    team = stripDecor(team);
    if (!team) continue;

    const defaults = DEFAULT_AVATARS[(base + parsed.length) % DEFAULT_AVATARS.length];
    parsed.push({
      no: no || String(base + parsed.length + 1),
      team,
      avatar: avatar || defaults[0],
      id: id || defaults[1],
      file: null,
      ai: null
    });
  }

  if (!parsed.length) {
    alert('Chưa đọc được danh sách. Hãy dán dạng: 1 EOP hoặc TEAM | AVATAR | ID.');
    return;
  }

  teams = append ? teams.concat(parsed) : parsed;
  render();
}

function render() {
  $('teamCount').textContent = teams.length;
  $('logoCount').textContent = files.length;
  $('matchedCount').textContent = teams.filter((team) => team.file).length;

  const tbody = $('tbody');
  tbody.innerHTML = '';

  teams.forEach((team, index) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${escapeHtml(team.no || index + 1)}</td>
      <td class="team">${escapeHtml(team.team)}</td>
      <td>
        <div class="logo-box">
          ${team.file ? `<img src="${team.file.url}" alt="">` : '<span class="muted">trống</span>'}
        </div>
      </td>
      <td><input class="cell-input" value="${escapeAttr(team.avatar)}" onchange="updateTeam(${index}, 'avatar', this.value)"></td>
      <td class="id"><input class="cell-input mono" value="${escapeAttr(team.id)}" onchange="updateTeam(${index}, 'id', this.value)"></td>
      <td>${renderAiStatus(team.ai)}</td>
      <td>
        <div class="row-actions">
          <button onclick="downloadOne(${index})" ${team.file ? '' : 'disabled'}>Tải PNG</button>
          <button class="danger" onclick="clearLogo(${index})" ${team.file ? '' : 'disabled'}>Gỡ logo</button>
        </div>
      </td>
    `;
    tbody.appendChild(row);
  });

  renderUnmatched();
}

function renderAiStatus(ai) {
  if (!ai) return '<div class="status">Chưa có logo.</div>';
  const state = ai.needs_review ? 'review' : 'ok';
  return `
    <div class="status">
      <b class="${state}">${escapeHtml(ai.source || (ai.needs_review ? 'Cần kiểm tra' : 'Đã ghép'))}</b><br>
      Đọc: ${escapeHtml(ai.detected_text || 'không rõ')}<br>
      Tin cậy: ${Math.round((ai.confidence || 0) * 100)}%<br>
      ${escapeHtml(ai.reasoning_short || '')}
    </div>
  `;
}

function renderUnmatched() {
  const box = $('unmatched');
  box.innerHTML = '';

  if (!unmatched.length) {
    box.innerHTML = '<p class="muted">Chưa có logo cần xác nhận.</p>';
    return;
  }

  unmatched.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'uitem';
    const options = ['<option value="">Chọn team đúng</option>']
      .concat(teams.map((team) => `<option value="${escapeAttr(team.team)}">${escapeHtml(team.team)} | ${escapeHtml(team.id)}</option>`))
      .join('');
    const candidates = (item.ai?.candidates || [])
      .map((candidate) => `<span class="pill">${escapeHtml(candidate.team)} ${Math.round((candidate.confidence || 0) * 100)}%</span>`)
      .join('');

    card.innerHTML = `
      <img src="${item.url}" alt="">
      <div class="status">
        <b>${escapeHtml(item.name)}</b><br>
        AI đọc: ${escapeHtml(item.ai?.detected_text || 'không rõ')}<br>
        Gợi ý: ${candidates || 'không có'}<br>
        ${escapeHtml(item.ai?.reasoning_short || '')}
      </div>
      <select id="sel_${item.key}">${options}</select>
      <div class="button-grid two">
        <button class="success" onclick="assignUnmatched('${item.key}')">Gán & học</button>
        <button onclick="removeUnmatched('${item.key}')">Bỏ qua</button>
      </div>
    `;
    box.appendChild(card);
  });
}

function findTeam(name) {
  const wanted = normalize(name);
  return teams.find((team) => normalize(team.team) === wanted);
}

function attachToTeam(teamName, fileObj, ai) {
  const team = findTeam(teamName);
  if (!team) return false;
  team.file = fileObj;
  team.ai = ai;
  return true;
}

async function fileToObj(file) {
  return {
    key: uid(),
    file,
    name: file.name,
    url: URL.createObjectURL(file),
    hash: await imageHash(file).catch(() => '')
  };
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

async function imageHash(file) {
  const url = URL.createObjectURL(file);
  const image = await loadImage(url);
  URL.revokeObjectURL(url);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = 16;
  canvas.height = 16;
  ctx.drawImage(image, 0, 0, 16, 16);

  const data = ctx.getImageData(0, 0, 16, 16).data;
  const values = [];
  for (let i = 0; i < data.length; i += 4) {
    values.push((data[i] + data[i + 1] + data[i + 2]) / 3);
  }
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.map((value) => value > average ? '1' : '0').join('');
}

function hamming(a, b) {
  if (!a || !b || a.length !== b.length) return 999;
  let distance = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) distance += 1;
  }
  return distance;
}

function loadLearning() {
  try {
    return JSON.parse(localStorage.getItem('ff_logo_ai_learning_v2') || '{"hashes":[],"texts":{}}');
  } catch {
    return { hashes: [], texts: {} };
  }
}

function saveLearning() {
  localStorage.setItem('ff_logo_ai_learning_v2', JSON.stringify(learning));
}

function learn(item, teamName, ai) {
  if (item.hash) {
    const existing = learning.hashes.find((entry) => entry.hash === item.hash);
    if (existing) existing.team = teamName;
    else learning.hashes.push({ hash: item.hash, team: teamName, at: Date.now() });
    learning.hashes = learning.hashes.slice(-2000);
  }

  const text = normalize(ai?.detected_text || '');
  if (text) learning.texts[text] = teamName;
  saveLearning();
}

function findLearned(item) {
  if (!$('useLearning').checked || !item.hash) return null;

  let best = null;
  let bestDistance = 999;
  for (const entry of learning.hashes || []) {
    const distance = hamming(item.hash, entry.hash);
    if (distance < bestDistance) {
      best = entry;
      bestDistance = distance;
    }
  }

  if (best && bestDistance <= 10 && findTeam(best.team)) {
    return {
      selected_team: best.team,
      confidence: 1,
      detected_text: 'Khớp dữ liệu đã học',
      candidates: [{ team: best.team, confidence: 1 }],
      reasoning_short: `Logo giống dữ liệu đã học, sai khác ${bestDistance}/256.`,
      needs_review: false,
      source: 'Đã học'
    };
  }

  return null;
}

function findLearnedByText(text) {
  const direct = learning.texts?.[normalize(text)];
  return direct && findTeam(direct) ? direct : null;
}

async function analyzeAll() {
  if (!hasApiKey) {
    alert('Chưa có OPENAI_API_KEY. Local thì lưu key ở đầu trang; Render thì đặt biến Environment.');
    return;
  }
  if (!teams.length) return alert('Hãy nhập danh sách team trước.');
  if (!files.length) return alert('Hãy upload logo trước.');

  $('analyzeBtn').disabled = true;
  unmatched = [];
  setBar(0);

  const threshold = Number($('threshold').value || 0.72);
  const teamPayload = teams.map(({ no, team, avatar, id }) => ({ no, team, avatar, id }));

  for (let i = 0; i < files.length; i += 1) {
    const item = files[i];
    setBar((i / files.length) * 100);

    const learned = findLearned(item);
    if (learned) {
      attachToTeam(learned.selected_team, item, learned);
      render();
      continue;
    }

    try {
      const formData = new FormData();
      formData.append('logo', item.file);
      formData.append('teamsJson', JSON.stringify(teamPayload));

      const response = await fetch('/api/analyze-logo', { method: 'POST', body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'AI không phân tích được logo.');

      let ai = data.result || {};
      const learnedTeam = findLearnedByText(ai.detected_text);
      if (learnedTeam) {
        ai = {
          ...ai,
          selected_team: learnedTeam,
          confidence: 1,
          needs_review: false,
          source: 'Đã học từ chữ'
        };
      }

      const selected = findTeam(ai.selected_team);
      if (selected && ai.confidence >= threshold && !ai.needs_review) {
        ai.source = ai.source || 'AI chắc';
        attachToTeam(selected.team, item, ai);
        if ($('autoLearn').checked) learn(item, selected.team, ai);
      } else {
        unmatched.push({ ...item, ai: { ...ai, source: 'Cần xác nhận' } });
      }
    } catch (error) {
      unmatched.push({
        ...item,
        ai: {
          detected_text: '',
          confidence: 0,
          candidates: [],
          reasoning_short: error.message,
          needs_review: true,
          source: 'Lỗi'
        }
      });
    }

    render();
  }

  setBar(100);
  $('analyzeBtn').disabled = false;
  render();
}

async function make500PngBlob(fileObj) {
  const image = await loadImage(fileObj.url);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = 500;
  canvas.height = 500;

  const background = $('bgMode').value;
  if (background === 'white' || background === 'black') {
    ctx.fillStyle = background === 'white' ? '#fff' : '#000';
    ctx.fillRect(0, 0, 500, 500);
  }

  const scale = Math.min(500 / image.width, 500 / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  const x = (500 - width) / 2;
  const y = (500 - height) / 2;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, x, y, width, height);

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

async function downloadOne(index) {
  const team = teams[index];
  if (!team?.file) return;

  const blob = await make500PngBlob(team.file);
  downloadBlob(blob, `${team.id || team.team}.png`);
}

async function downloadZip() {
  const matched = teams.filter((team) => team.file);
  if (!matched.length) return alert('Chưa có logo nào đã ghép.');

  $('zipBtn').disabled = true;
  const filesForZip = [];

  for (let i = 0; i < matched.length; i += 1) {
    const team = matched[i];
    setBar((i / matched.length) * 100);
    const blob = await make500PngBlob(team.file);
    filesForZip.push({ name: `${team.id || team.team}.png`, data: await blob.arrayBuffer() });
  }

  const csv = 'NO,TEAM,AVATAR,HEADPICS_ID,ORIGINAL_FILE,AI_TEXT,CONFIDENCE\n'
    + matched.map((team) => [
      team.no,
      team.team,
      team.avatar,
      team.id,
      team.file.name,
      team.ai?.detected_text || '',
      team.ai?.confidence || ''
    ].map(csvCell).join(',')).join('\n');
  filesForZip.push({ name: 'mapping.csv', data: new TextEncoder().encode(csv).buffer });

  const zipBlob = buildStoredZip(filesForZip);
  downloadBlob(zipBlob, 'ff_team_logos_500x500.zip');
  $('zipBtn').disabled = false;
  setBar(100);
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
}

function buildStoredZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = new TextEncoder().encode(entry.name);
    const dataBytes = new Uint8Array(entry.data);
    const crc = crc32(dataBytes);
    const local = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, dataBytes.length, true);
    localView.setUint32(22, dataBytes.length, true);
    localView.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    localParts.push(local, dataBytes);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, dataBytes.length, true);
    centralView.setUint32(24, dataBytes.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralParts.push(central);

    offset += local.length + dataBytes.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);

  return new Blob([...localParts, ...centralParts, end], { type: 'application/zip' });
}

let crcTable;
function crc32(bytes) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      crcTable[n] = c >>> 0;
    }
  }

  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function clearLogo(index) {
  if (!teams[index]) return;
  teams[index].file = null;
  teams[index].ai = null;
  render();
}

function updateTeam(index, field, value) {
  if (!teams[index] || !['avatar', 'id'].includes(field)) return;
  teams[index][field] = String(value || '').trim();
}

function setBar(value) {
  $('bar').style.width = `${Math.max(0, Math.min(100, value))}%`;
}

async function onFilesSelected(event) {
  const chosen = [...event.target.files];
  await setFiles(chosen);
}

async function setFiles(chosen) {
  files = [];
  for (const file of chosen) files.push(await fileToObj(file));
  render();
}

function assignUnmatched(key) {
  const item = unmatched.find((entry) => entry.key === key);
  if (!item) return;

  const teamName = $(`sel_${key}`).value;
  if (!teamName) return alert('Chọn team trước.');

  const ai = {
    ...(item.ai || {}),
    selected_team: teamName,
    confidence: 1,
    needs_review: false,
    source: 'Bạn xác nhận',
    reasoning_short: 'Bạn đã gán thủ công và hệ thống đã học.'
  };

  attachToTeam(teamName, item, ai);
  learn(item, teamName, ai);
  unmatched = unmatched.filter((entry) => entry.key !== key);
  render();
}

function removeUnmatched(key) {
  unmatched = unmatched.filter((entry) => entry.key !== key);
  render();
}

function saveTeams() {
  const payload = teams.map(({ no, team, avatar, id }) => ({ no, team, avatar, id }));
  localStorage.setItem('ff_logo_ai_teams_v2', JSON.stringify(payload));
  alert('Đã lưu danh sách team trong trình duyệt.');
}

function loadTeams() {
  try {
    const stored = JSON.parse(localStorage.getItem('ff_logo_ai_teams_v2') || '[]');
    if (!stored.length) return alert('Chưa có danh sách đã lưu.');
    teams = stored.map((team) => ({ ...team, file: null, ai: null }));
    render();
  } catch {
    alert('Không đọc được danh sách đã lưu.');
  }
}

function openModal(title, help, text, onOk) {
  $('modalTitle').textContent = title;
  $('modalHelp').textContent = help;
  $('modalText').value = text || '';
  $('modalOk').onclick = (event) => {
    event.preventDefault();
    onOk($('modalText').value);
    $('modal').close();
  };
  $('modal').showModal();
}

async function checkApiKey() {
  try {
    const response = await fetch('/api/health');
    const data = await response.json();
    hasApiKey = Boolean(data.has_api_key);
    allowSaveKey = Boolean(data.allow_save_key);

    $('healthBox').className = `health ${hasApiKey ? 'ok' : 'warn'}`;
    $('healthBox').textContent = hasApiKey
      ? `AI sẵn sàng. Model: ${data.model}`
      : 'Chưa có OPENAI_API_KEY.';

    $('apiRow').style.display = allowSaveKey ? 'grid' : 'none';
    $('apiHelp').textContent = allowSaveKey
      ? 'Local có thể lưu key vào file .env. Khi deploy Render, đặt OPENAI_API_KEY trong Environment.'
      : 'Production không nhận lưu key qua web. Hãy đặt OPENAI_API_KEY trong Environment của Render.';
  } catch {
    hasApiKey = false;
    $('healthBox').className = 'health warn';
    $('healthBox').textContent = 'Không kết nối được server.';
  }
}

async function saveApiKey() {
  const apiKey = $('apiKeyInput').value.trim();
  if (!apiKey) return alert('Bạn chưa dán API key.');
  if (!apiKey.startsWith('sk-')) return alert('API key thường bắt đầu bằng sk-.');

  $('saveApiKeyBtn').disabled = true;
  try {
    const response = await fetch('/api/save-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Không lưu được key.');
    $('apiKeyInput').value = '';
    await checkApiKey();
  } catch (error) {
    alert(error.message);
  } finally {
    $('saveApiKeyBtn').disabled = false;
  }
}

$('saveApiKeyBtn').onclick = saveApiKey;
$('checkApiBtn').onclick = checkApiKey;
$('parseBtn').onclick = () => parseTeams($('pasteBox').value, false);
$('appendBtn').onclick = () => parseTeams($('pasteBox').value, true);
$('sampleBtn').onclick = () => {
  $('pasteBox').value = SAMPLE;
  parseTeams(SAMPLE, false);
};
$('clearBtn').onclick = () => {
  if (confirm('Xóa toàn bộ bảng team?')) {
    teams = [];
    unmatched = [];
    render();
  }
};
$('saveTeamsBtn').onclick = saveTeams;
$('loadTeamsBtn').onclick = loadTeams;
$('fileInput').onchange = onFilesSelected;
$('fileInput').closest('.dropzone').ondragover = (event) => {
  event.preventDefault();
  event.currentTarget.classList.add('dragging');
};
$('fileInput').closest('.dropzone').ondragleave = (event) => {
  event.currentTarget.classList.remove('dragging');
};
$('fileInput').closest('.dropzone').ondrop = async (event) => {
  event.preventDefault();
  event.currentTarget.classList.remove('dragging');
  await setFiles([...event.dataTransfer.files].filter((file) => /^image\/(png|jpe?g|webp)$/i.test(file.type)));
};
$('analyzeBtn').onclick = analyzeAll;
$('zipBtn').onclick = downloadZip;
$('exportLearnBtn').onclick = () => {
  openModal('Xuất dữ liệu học', 'Copy JSON này để chuyển sang máy khác hoặc lưu backup.', JSON.stringify(learning, null, 2), () => {});
};
$('importLearnBtn').onclick = () => {
  openModal('Nhập dữ liệu học', 'Dán JSON đã xuất trước đó.', '', (text) => {
    try {
      const data = JSON.parse(text);
      if (!Array.isArray(data.hashes) || typeof data.texts !== 'object') throw new Error('Sai cấu trúc dữ liệu học.');
      learning = data;
      saveLearning();
      alert('Đã nhập dữ liệu học.');
    } catch (error) {
      alert(`JSON không hợp lệ: ${error.message}`);
    }
  });
};
$('modalCancel').onclick = () => $('modal').close();

parseTeams($('pasteBox').value, false);
checkApiKey();
