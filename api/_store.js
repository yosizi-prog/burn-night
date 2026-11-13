// Burn Night 共有プレゼンス ― 共通部品
// Upstash Redis へ REST(fetch) で読み書きするための小さな道具箱。
// 接続情報は Vercel の環境変数から読む。値そのものはコードにもログにも書かない。
// このファイルは "_" 始まりなので API ルートにはならず、部品としてだけ使われる。

const crypto = require('crypto');

const REST_URL =
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const REST_TOKEN =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';

function configured() {
  return Boolean(REST_URL && REST_TOKEN);
}

// Redis コマンドの配列をまとめて送る（Upstash REST の pipeline）。
// 戻り値は各コマンドの result の配列。失敗したら例外を投げる。
async function pipeline(commands) {
  const res = await fetch(REST_URL.replace(/\/$/, '') + '/pipeline', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + REST_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error('store http ' + res.status);
  const out = await res.json();
  if (!Array.isArray(out)) throw new Error('store bad response');
  for (const item of out) {
    if (item && item.error) throw new Error('store command error');
  }
  return out.map((i) => (i ? i.result : null));
}

// クライアントトークン（16進32文字）の形式チェック。正規化した文字列か null を返す。
function cleanToken(t) {
  if (typeof t !== 'string') return null;
  const s = t.trim().toLowerCase();
  return /^[0-9a-f]{32}$/.test(s) ? s : null;
}

// トークンはそのまま保存せず、SHA-256 ハッシュだけを使う。
function hashToken(t) {
  return crypto.createHash('sha256').update(t).digest('hex');
}

// 「今夜」のカウンタ用キー（JST の日付）。寿命は 48 時間（呼び出し側で EXPIRE）。
function tonightKey() {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(jst.getUTCDate()).padStart(2, '0');
  return 'bn:burns:' + y + '-' + m + '-' + d;
}

// リクエストボディ（JSON）を読む。読めなければ空オブジェクト。
async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch (e) {
      return {};
    }
  }
  let raw = '';
  try {
    for await (const chunk of req) raw += chunk;
  } catch (e) {
    return {};
  }
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

function send(res, code, obj) {
  setCors(res);
  res.status(code).json(obj);
}

// OPTIONS プリフライトへの応答。処理したら true。
function preflight(req, res) {
  if (req.method !== 'OPTIONS') return false;
  setCors(res);
  res.status(204).end();
  return true;
}

module.exports = {
  configured,
  pipeline,
  cleanToken,
  hashToken,
  tonightKey,
  readBody,
  send,
  preflight,
};
