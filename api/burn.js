// Burn Night 共有プレゼンス ― POST /api/burn
// 「今、言葉を燃やした」という合図だけを受け取る口。
// リクエスト: { "t": "クライアントトークン（16進32文字）" }
// ★ テキストのフィールドは存在しない。送られてきても読まない（読むのは t だけ）。
// レスポンス: { ok, recorded, tonight }
//   recorded … 今回が記録されたか（20秒クールダウン中は false。見た目は ok のまま）
// 記録するのは「時刻」と「トークンのハッシュ断片」だけ。

const {
  configured,
  pipeline,
  cleanToken,
  hashToken,
  tonightKey,
  readBody,
  send,
  preflight,
} = require('./_store');

module.exports = async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') {
    return send(res, 405, { ok: false, error: 'method not allowed' });
  }
  if (!configured()) {
    return send(res, 503, { ok: false, store: false });
  }
  const body = await readBody(req);
  const token = cleanToken(body.t);
  if (!token) {
    return send(res, 400, { ok: false, error: 'invalid token' });
  }
  try {
    const now = Date.now();
    const hash = hashToken(token);
    const frag = hash.slice(0, 8);
    const key = tonightKey();

    // クールダウン：トークンごとに20秒に1回まで。キーが取れたときだけ受理。
    const cd = await pipeline([['SET', 'bn:cd:' + hash, '1', 'NX', 'EX', '20']]);
    if (cd[0] !== 'OK') {
      const cur = await pipeline([['GET', key]]);
      return send(res, 200, {
        ok: true,
        recorded: false,
        tonight: cur[0] == null ? 0 : Number(cur[0]),
      });
    }

    const results = await pipeline([
      ['INCR', key], // 今夜カウンタ +1
      ['EXPIRE', key, '172800'], // 寿命48時間
      ['LPUSH', 'bn:ev', now + ':' + frag], // イベントは「時刻：断片」だけ
      ['LTRIM', 'bn:ev', '0', '99'], // 最大100件
      ['EXPIRE', 'bn:ev', '300'], // 寿命5分
      ['ZADD', 'bn:pres', String(now), hash], // 送信者も在席に登録
      ['ZREMRANGEBYSCORE', 'bn:pres', '-inf', String(now - 75000)],
    ]);
    return send(res, 200, {
      ok: true,
      recorded: true,
      tonight: Number(results[0]) || 0,
    });
  } catch (e) {
    return send(res, 500, { ok: false, error: 'store error' });
  }
};
