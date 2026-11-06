export type Article={id:string;title:string;description:string;url:string;image:string;imageUrl:string;publishedAt:string;category:string;source:string;author?:string;paragraphs:string[];images:{url:string;alt:string;caption?:string;sourceUrl?:string;downloadError?:string}[];sentences:{id:string;text:string;paragraphIndex:number}[];contentStatus:"full"|"summary_only";fetchedAt?:string;error?:string;imagesComplete?:boolean;contentHash?:string};
import * as cheerio from 'cheerio';
import { findArticle, queryArticles } from './repository.js';
export const categories = [['world', 'Thế giới'], ['business', 'Kinh doanh'], ['technology', 'Công nghệ'], ['science_and_environment', 'Khoa học'], ['health', 'Sức khỏe'], ['entertainment_and_arts', 'Văn hóa'], ['sport', 'Thể thao']].map(([id, label]) => ({ id, label, feedUrl: id === 'sport' ? 'https://feeds.bbci.co.uk/sport/rss.xml' : `https://feeds.bbci.co.uk/news/${id}/rss.xml` }));
export function allowedBbcUrl(value:string) { try {
    const u = new URL(value);
    return u.protocol === 'https:' && ['www.bbc.com', 'www.bbc.co.uk', 'feeds.bbci.co.uk'].includes(u.hostname) && !u.username && !u.password && (!u.port || u.port === '443');
}
catch {
    return false;
} }
export async function fetchBbc(url:string) {
    if (!allowedBbcUrl(url))
        throw new Error('Only official BBC URLs are supported');
    for (let i = 0; i < 4; i++) {
        const r = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'manual', headers: { 'User-Agent': 'FolioReader/1.0 (personal English reading app)', 'Accept': 'text/html,application/rss+xml,application/xml;q=0.9,*/*;q=0.8' } });
        if (r.status >= 300 && r.status < 400) {
            const next = new URL(r.headers.get('location') || '', url).href;
            if (!allowedBbcUrl(next))
                throw new Error('Blocked redirect');
            url = next;
            continue;
        }
        if (!r.ok)
            throw new Error(`BBC returned HTTP ${r.status}`);
        const buffer = await r.arrayBuffer();
        if (buffer.byteLength > 8_000_000)
            throw new Error('Article too large');
        return Buffer.from(buffer).toString('utf8');
    }
    throw new Error('Too many redirects');
}
const clean = (s:string) => s.replace(/\s+/g, ' ').trim();
export function extractArticle(html:string) {
    const $ = cheerio.load(html);
    let root = $('article').first();
    if (!root.length)
        root = $('main').first();
    let paragraphs:string[] = [];
    const specific = root.find('[data-component="text-block"] p, [data-block="text"] p');
    (specific.length ? specific : root.find('p')).each((_, el) => { const text = clean($(el).text()); if (text && text.length > 15 && !/^(Copyright|Follow BBC|Sign up for|Related topics|You need to enable)/i.test(text))
        paragraphs.push(text); });
    paragraphs = [...new Set(paragraphs)];
    const images:Article['images'] = [];
    const seen = new Set();
    root.find('figure img, [data-component="image-block"] img, [data-block="image"] img').each((_, el) => {
        const img = $(el);
        const srcset = img.attr('srcset');
        let url = srcset?.split(',').at(-1)?.trim().split(/\s+/)[0] || img.attr('src') || img.attr('data-src');
        if (!url || !/^https:\/\//.test(url) || seen.has(url))
            return;
        seen.add(url);
        const caption = clean(img.closest('figure').find('figcaption').text());
        images.push({ url, alt: img.attr('alt') || '', caption });
    });
    const og = $('meta[property="og:image"]').attr('content');
    if (og && !images.length)
        images.push({ url: og, alt: $('h1').text() });
    let author = clean(root.find('[data-testid="byline-name"], [class*="Contributor"]').first().text());
    for (const script of $('script[type="application/ld+json"]').toArray())
        try {
            const obj = JSON.parse($(script).text());
            const candidates = Array.isArray(obj) ? obj : obj['@graph'] || [obj];
            for (const item of candidates) {
                if (item.articleBody && !paragraphs.length)
                    paragraphs = String(item.articleBody).split(/\n+/).map(clean).filter(Boolean);
                if (item.author)
                    author = Array.isArray(item.author) ? item.author.map((a:any) => a.name).join(', ') : item.author.name || '';
            }
        }
        catch { }
    // International BBC's Next.js payload can carry text absent in rendered markup.
    if (!paragraphs.length) {
        try {
            const obj = JSON.parse($('#__NEXT_DATA__').text());
            const walk = (v:any) => { if (!v || typeof v !== 'object')
                return; if (v.type === 'text' && typeof v.text === 'string')
                paragraphs.push(clean(v.text)); Object.values(v).forEach(child => { if (typeof child === 'object')
                walk(child); }); };
            walk(obj);
        }
        catch { }
    }
    return { paragraphs: [...new Set(paragraphs)], images, author };
}
export function segment(paragraphs:string[]) { const s = new Intl.Segmenter('en', { granularity: 'sentence' }); return paragraphs.flatMap((text, paragraphIndex) => [...s.segment(text)].map((item, index) => ({ id: `p${paragraphIndex}-s${index}`, text: item.segment.trim(), paragraphIndex }))); }
// Reader endpoints query MySQL only; upstream fetching belongs exclusively to jobs.ts.
export const getArticle = findArticle;
export const listArticles = queryArticles;
