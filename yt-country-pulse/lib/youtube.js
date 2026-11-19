// YouTube Data API v3 — sursa OFICIALA. Chart "mostPopular" = videoclipurile in trend
// intr-o tara (regionCode), exact ca pagina "Trending" din YouTube.
//
// Necesita cheie API gratuita: https://console.cloud.google.com/apis/credentials
// (activezi "YouTube Data API v3"). Cota gratuita: 10.000 unitati/zi; un apel = 1 unitate.

import { fetchJson, HttpError } from './http.js';

const API = 'https://www.googleapis.com/youtube/v3';

export async function trendingVideos({ apiKey, geo, maxResults = 24 }) {
  if (!apiKey) throw new HttpError('Lipsește cheia YouTube Data API', { status: 0 });

  const params = new URLSearchParams({
    part: 'snippet,statistics',
    chart: 'mostPopular',
    regionCode: geo,
    maxResults: String(Math.min(Math.max(maxResults, 1), 50)),
    key: apiKey,
  });

  const data = await fetchJson(`${API}/videos?${params.toString()}`, { retries: 1, timeoutMs: 12000 });

  const items = (data?.items || []).map((item, index) => ({
    rank: index + 1,
    videoId: item.id,
    title: item?.snippet?.title || '',
    channel: item?.snippet?.channelTitle || '',
    channelId: item?.snippet?.channelId || '',
    publishedAt: item?.snippet?.publishedAt || '',
    thumbnail: item?.snippet?.thumbnails?.medium?.url || item?.snippet?.thumbnails?.default?.url || '',
    views: Number(item?.statistics?.viewCount || 0),
    likes: Number(item?.statistics?.likeCount || 0),
    comments: Number(item?.statistics?.commentCount || 0),
    url: item.id ? `https://www.youtube.com/watch?v=${item.id}` : '',
    tags: (item?.snippet?.tags || []).slice(0, 5),
  }));

  return { regionCode: geo, items };
}

export function friendlyYouTubeError(err) {
  const status = err?.status || 0;
  const body = String(err?.body || '');
  let detail = '';
  try {
    const parsed = JSON.parse(body);
    detail = parsed?.error?.message || '';
  } catch {
    detail = body.slice(0, 180);
  }

  if (status === 400 && /API key not valid/i.test(detail)) {
    return 'Cheia YouTube Data API nu este validă. Verifică valoarea introdusă.';
  }
  if (status === 403 && /has not been used|is disabled|SERVICE_DISABLED/i.test(detail)) {
    return 'YouTube Data API v3 nu este activat pentru acest proiect Google Cloud. Activează-l din consolă.';
  }
  if (status === 403 && /quota/i.test(detail)) {
    return 'Cota zilnică YouTube Data API a fost depășită. Revine mâine sau folosește alt proiect.';
  }
  if (status === 429) {
    return 'Google a limitat cererile (429). Așteaptă un minut și reîncearcă.';
  }
  return detail || err?.message || 'Eroare la apelul YouTube Data API';
}
