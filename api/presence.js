// Burn Night 共有プレゼンス ― POST /api/presence
// ハートビート＋状態取得の兼用口。
// リクエスト: { "t": "クライアントトークン（16進32文字）" }
// レスポンス: { ok, now, present, tonight, events }
//   present … 直近75秒以内にハートビートした端末数（自分を含む）
//   tonight … JST の今日、手動で燃やされた回数
//   events  … 直近90秒以内の燃焼イベント "ミリ秒時刻:ハッシュ先頭8文字"
// 保存されるのは数と時刻とハッシュだけ。言葉・座標・名前は存在しない。

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
    const results = await pipeline([
      // 在席セットに自分のハッシュを「今」で登録
      ['ZADD', 'bn:pres', String(now), hash],
      // 75秒より古い在席を掃除
      ['ZREMRANGEBYSCORE', 'bn:pres', '-inf', String(now - 75000)],
      ['ZCARD', 'bn:pres'],
      ['LRANGE', 'bn:ev', '0', '-1'],
      ['GET', tonightKey()],
    ]);
    const rawEvents = Array.isArray(results[3]) ? results[3] : [];
    const events = rawEvents.filter((s) => {
      const ms = parseInt(String(s).split(':')[0], 10);
      return Number.isFinite(ms) && ms > now - 90000;
    });
    return send(res, 200, {
      ok: true,
      now,
      present: results[2] || 0,
      tonight: results[4] == null ? 0 : Number(results[4]),
      events,
    });
  } catch (e) {
    return send(res, 500, { ok: false, error: 'store error' });
  }
};
