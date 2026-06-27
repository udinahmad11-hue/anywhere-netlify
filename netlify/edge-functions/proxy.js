export default async (request, context) => {
  const urlObj = new URL(request.url);
  const pathname = urlObj.pathname; // Mengambil /api/proxy/https://...

  // 1. Ambil URL asli langsung dari path setelah '/api/proxy/'
  let targetUrl = pathname.replace("/api/proxy/", "");

  // Jika kosong, berikan response bad request
  if (!targetUrl || targetUrl === "/") {
    return new Response("Error: Missing target URL parameter.", { status: 400 });
  }

  // Fix jika ada double slash akibat rewrite router (http:/ menjadi http://)
  if (targetUrl.startsWith("http:/") && !targetUrl.startsWith("http://")) {
    targetUrl = targetUrl.replace("http:/", "http://");
  } else if (targetUrl.startsWith("https:/") && !targetUrl.startsWith("https://")) {
    targetUrl = targetUrl.replace("https:/", "https://");
  }

  // 2. Gandeng kembali query string bawaan player jika ada (seperti token atau nama segmen)
  if (urlObj.search) {
    targetUrl += urlObj.search;
  }

  // Validasi URL sah
  if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
    return new Response("Error: Invalid URL format. Received: " + targetUrl, { status: 400 });
  }

  try {
    // 3. Siapkan request headers untuk dikirim ke CDN asli (Starhub, dll)
    const forwardHeaders = new Headers();
    forwardHeaders.set("User-Agent", request.headers.get("user-agent") || "Mozilla/5.0");
    forwardHeaders.set("Accept", "*/*");
    
    if (request.headers.get("x-forwarded-for")) {
      forwardHeaders.set("X-Forwarded-For", request.headers.get("x-forwarded-for"));
    }
    
    if (targetUrl.includes("starhub")) {
      forwardHeaders.set("Referer", "https://www.starhub.com/");
      forwardHeaders.set("Origin", "https://www.starhub.com");
    }

    // 4. Ambil data dari server target (bisa berupa manifest teks atau segmen video biner)
    const targetResponse = await fetch(targetUrl, {
      method: request.method,
      headers: forwardHeaders,
      body: request.body,
      redirect: "follow"
    });

    const responseBody = await targetResponse.arrayBuffer();

    // 5. Inject CORS Header agar bisa diputar di OTT Navigator / Player
    const responseHeaders = new Headers(targetResponse.headers);
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    responseHeaders.set("Access-Control-Allow-Headers", "*");
    
    responseHeaders.delete("Content-Security-Policy");
    responseHeaders.delete("X-Frame-Options");

    return new Response(responseBody, {
      status: targetResponse.status,
      statusText: targetResponse.statusText,
      headers: responseHeaders
    });

  } catch (error) {
    return new Response("Proxy Error: " + error.message, { status: 500 });
  }
};
