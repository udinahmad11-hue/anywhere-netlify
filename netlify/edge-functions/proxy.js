export default async (request, context) => {
  const urlObj = new URL(request.url);
  const pathname = urlObj.pathname; // Mengambil /api/proxy/BASE64...

  // 1. Ambil string Base64 dari path setelah '/api/proxy/'
  let base64Part = pathname.replace("/api/proxy/", "");

  // Jika string kosong, berikan response bad request
  if (!base64Part || base64Part === "/") {
    return new Response("Error: Missing Base64 URL parameter.", { status: 400 });
  }

  // Bersihkan slash ujung jika ada dari bentukan player/BaseURL
  if (base64Part.endsWith("/")) {
    base64Part = base64Part.slice(0, -1);
  }

  let targetUrl = "";
  try {
    // 2. Normalisasi URL-Safe Base64 balik ke Base64 standar jika diperlukan
    let normalizedBase64 = base64Part.replace(/-/g, "+").replace(/_/g, "/");
    
    // Handle padding '=' yang hilang jika string tidak klop kelipatan 4
    while (normalizedBase64.length % 4 !== 0) {
      normalizedBase64 += "=";
    }

    // Decode Base64 ke String URL Asli
    const decodedBytes = atob(normalizedBase64);
    targetUrl = decodedBytes;
  } catch (e) {
    return new Response("Error: Failed to decode Base64 string. " + e.message, { status: 400 });
  }

  // Validasi apakah hasil decode berupa URL yang sah
  if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
    return new Response("Error: Decoded string is not a valid HTTP/HTTPS URL. Result: " + targetUrl, { status: 400 });
  }

  try {
    // 3. Gandeng kembali query string asli bawaan player jika ada (seperti nama segmen biner)
    if (urlObj.search) {
      targetUrl += urlObj.search;
    }

    // 4. Siapkan request headers untuk menembak CDN upstream (Starhub, dll)
    const forwardHeaders = new Headers();
    forwardHeaders.set("User-Agent", request.headers.get("user-agent") || "Mozilla/5.0");
    forwardHeaders.set("Accept", "*/*");
    
    // Teruskan header khusus jika dikirim oleh script PHP kamu (seperti X-Forwarded-For)
    if (request.headers.get("x-forwarded-for")) {
      forwardHeaders.set("X-Forwarded-For", request.headers.get("x-forwarded-for"));
    }
    
    if (targetUrl.includes("starhub")) {
      forwardHeaders.set("Referer", "https://www.starhub.com/");
      forwardHeaders.set("Origin", "https://www.starhub.com");
    }

    // 5. Lakukan fetching ke server target
    const targetResponse = await fetch(targetUrl, {
      method: request.method,
      headers: forwardHeaders,
      body: request.body,
      redirect: "follow"
    });

    // 6. Baca body response (bisa berupa teks MPD atau biner segmen .dash)
    const responseBody = await targetResponse.arrayBuffer();

    // 7. Modifikasi Header Response untuk Bypass CORS ke Player
    const responseHeaders = new Headers(targetResponse.headers);
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    responseHeaders.set("Access-Control-Allow-Headers", "*");
    
    // Hapus header security bawaan target yang bisa memblokir player
    responseHeaders.delete("Content-Security-Policy");
    responseHeaders.delete("X-Frame-Options");

    // Kembalikan hasilnya ke OTT Navigator / Player
    return new Response(responseBody, {
      status: targetResponse.status,
      statusText: targetResponse.statusText,
      headers: responseHeaders
    });

  } catch (error) {
    return new Response("Proxy Error: " + error.message, { status: 500 });
  }
};
