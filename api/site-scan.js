const { parseRequestBody } = require("../lib/qa-core");
const { runSitePreviewScan } = require("../lib/site-scan");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  let body;
  try {
    body = await parseRequestBody(req);
  } catch {
    return res.status(400).json({ ok: false, error: "Invalid JSON body" });
  }

  const result = await runSitePreviewScan(body?.url);
  return res.status(result.status || (result.ok ? 200 : 500)).json(result);
};
