// functions/proxy.js (Netlify Functions - Node.js Runtime)
const fetch = require('node-fetch'); // Node.js lama butuh ini, Netlify menyediakannya otomatis

exports.handler = async (event, context) => {
  // 1. Ambil URL target dari query parameter '?url='
  let targetUrl = event.queryStringParameters.url;

  // Jika parameter url tidak ada, berikan response error
  if (!targetUrl) {
    return {
      statusCode: 400,
      body: "Error: Missing 'url' query parameter. Usage: /.netlify/functions/proxy?url=HTTPS_URL"
    };
  }

  // 2. Gabungkan kembali query string tambahan lainnya (kecuali parameter 'url')
  const remainingParams = { ...event.queryStringParameters };
  delete remainingParams.url;
  
  const searchParams = new URLSearchParams(remainingParams).toString();
  if (searchParams) {
    targetUrl += (targetUrl.includes("?") ? "&" : "?") + searchParams;
  }

  // Validasi URL sah
  if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
    return {
      statusCode: 400,
      body: "Error: Invalid URL format. Must start with http/https."
    };
  }

  try {
    // 3. Siapkan request headers untuk dikirim ke CDN asli (Starhub, dll)
    const forwardHeaders = {
      "User-Agent": event.headers["user-agent"] || "Mozilla/5.0",
      "Accept": "*/*"
    };
    
    if (event.headers["x-forwarded-for"]) {
      forwardHeaders["X-Forwarded-For"] = event.headers["x-forwarded-for"];
    }
    
    if (targetUrl.includes("starhub")) {
      forwardHeaders["Referer"] = "https://www.starhub.com/";
      forwardHeaders["Origin"] = "https://www.starhub.com";
    }

    // 4. Ambil data dari server target (menggunakan method GET standar untuk manifest)
    const targetResponse = await fetch(targetUrl, {
      method: "GET",
      headers: forwardHeaders,
      redirect: "follow"
    });

    // Baca body response sebagai teks (cocok untuk MPD)
    // Catatan: Untuk segmen biner berukuran sangat besar, cara ini mungkin terbatas oleh memori lambda.
    const responseBody = await targetResponse.text();

    // 5. Inject CORS Header dan Siapkan Response
    const responseHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Content-Type": targetResponse.headers.get("content-type") || "text/plain"
    };

    return {
      statusCode: targetResponse.status,
      headers: responseHeaders,
      body: responseBody
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: "Proxy Error: " + error.message
    };
  }
};
