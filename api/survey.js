// src/server/survey.ts
async function parseBody(req) {
  const reqObj = req;
  if (typeof reqObj.json === "function" && reqObj.body === void 0) {
    try {
      return await reqObj.json();
    } catch {
      return null;
    }
  }
  let body = reqObj.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = null;
    }
  }
  return body ?? null;
}
async function handleSurveyApiRequest(body, config) {
  if (!body || typeof body !== "object") {
    return {
      status: 400,
      body: { status: "error", message: "Missing or malformed JSON payload" }
    };
  }
  const payload = body;
  const overallRating = payload.overallRating;
  if (typeof overallRating !== "number" || overallRating < 1 || overallRating > 10) {
    return {
      status: 400,
      body: { status: "error", message: "overallRating must be a number between 1 and 10" }
    };
  }
  const webhookUrl = config?.webhookUrl || process.env.SURVEY_WEBHOOK_URL;
  const fetchFn = config?.fetchFn || (typeof fetch !== "undefined" ? fetch : void 0);
  if (!webhookUrl) {
    return {
      status: 200,
      body: {
        status: "ok",
        forwarded: false,
        mode: "local_only",
        message: "Survey stored locally. Configure SURVEY_WEBHOOK_URL to stream to Google Sheets."
      }
    };
  }
  if (!fetchFn) {
    return {
      status: 500,
      body: { status: "error", message: "Fetch client unavailable in server environment" }
    };
  }
  try {
    const upstreamRes = await fetchFn(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      redirect: "follow"
    });
    if (!upstreamRes.ok) {
      console.warn(`[Survey Webhook] Upstream responded with HTTP ${upstreamRes.status}`);
      return {
        status: 502,
        body: {
          status: "error",
          forwarded: false,
          message: `Upstream webhook responded with status ${upstreamRes.status}`
        }
      };
    }
    return {
      status: 200,
      body: {
        status: "ok",
        forwarded: true,
        mode: "streamed",
        message: "Successfully streamed survey response to Google Sheet"
      }
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[Survey Webhook] Failed to forward survey payload:", errorMsg);
    return {
      status: 502,
      body: {
        status: "error",
        forwarded: false,
        message: `Failed to connect to Google Sheets webhook: ${errorMsg}`
      }
    };
  }
}
async function handler(req, res) {
  const isWebStandard = !res || typeof res.status !== "function";
  const method = req?.method ?? "GET";
  if (method !== "POST") {
    const errorBody = { status: "error", message: "Method Not Allowed. Use POST." };
    if (isWebStandard) {
      return new Response(JSON.stringify(errorBody), {
        status: 405,
        headers: { "Content-Type": "application/json", Allow: "POST" }
      });
    }
    res.status(405).json(errorBody);
    return;
  }
  const body = await parseBody(req);
  const result = await handleSurveyApiRequest(body);
  if (isWebStandard) {
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { "Content-Type": "application/json" }
    });
  }
  res.status(result.status).json(result.body);
}
export {
  handler as default,
  handleSurveyApiRequest
};
