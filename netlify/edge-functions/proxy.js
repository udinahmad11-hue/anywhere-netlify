export default async (request, context) => {
  const urlObj = new URL(request.url);
  
  // 1. Ambil URL target langsung dari query parameter '?url='
  let targetUrl = urlObj.searchParams.get("url");

  // Jika parameter url tidak ada, berikan response error
  if (!targetUrl) {
    return new Response("Error: Missing 'url' query parameter. Usage: /api/proxy?url=HTTPS_URL", { status: 400 });
  }

  // 2. Jika ada query string tambahan dari player selain 'url', gabungkan kembali
  // (Sangat penting untuk membawa token atau hash biner stream)
  urlObj.searchParams.delete("url"); 
  const remainingSearchParams = urlObj.searchParams.toString();
  if (remainingSearchParams) {
    targetUrl += (targetUrl.includes("?") ? "&" : "?") + remainingSearchParams;
  }

  // Validasi URL sah
  if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
    return new Response("Error: Invalid URL format. Must start with http/https.", { status: 400 });
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

    // 4. Ambil data dari server target
    const targetResponse = await fetch(targetUrl, {
      method: request.method,
      headers: forwardHeaders,
      body: request.body,
      redirect: "follow"
    });

    const responseBody = await targetResponse.arrayBuffer();

    // 5. Inject CORS Header agar bisa diputar di Player
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
