// Burn Night 共有プレゼンス ― GET /api/health
// 検証用。書き込みはしない。{ ok, store, present, tonight } を返す。
// present は「直近75秒以内にハートビートした端末数」の読み取り専用カウント。

const { configured, pipeline, tonightKey, send, preflight } = require('./_store');

module.exports = async (req, res) => {
  if (preflight(req, res)) return;
  if (req.method !== 'GET') {
    return send(res, 405, { ok: false, error: 'method not allowed' });
  }
  if (!configured()) {
    return send(res, 503, { ok: false, store: false });
  }
  try {
    const now = Date.now();
    const results = await pipeline([
      ['PING'],
      ['ZCOUNT', 'bn:pres', String(now - 75000), '+inf'],
      ['GET', tonightKey()],
    ]);
    return send(res, 200, {
      ok: true,
      store: true,
      now,
      present: results[1] || 0,
      tonight: results[2] == null ? 0 : Number(results[2]),
    });
  } catch (e) {
    // 保存先に届かない。値は漏らさず、届かないことだけを返す。
    return send(res, 503, { ok: false, store: false });
  }
};
