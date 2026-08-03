import { normalizeUrl } from '../../domain/job-posting.js';

const strip = value => String(value || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const absolute = (href, base) => { try { return new URL(href, base).toString(); } catch { return ''; } };
export function linksFromHtml(html, baseUrl, matcher = /job|career|recruit|detail|entry|募集/i) { const links = []; const regex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi; for (const match of html.matchAll(regex)) { const url = absolute(match[1], baseUrl); const title = strip(match[2]); if (url && (matcher.test(url) || matcher.test(title))) links.push({ url: normalizeUrl(url), title }); } return [...new Map(links.map(item => [item.url, item])).values()]; }
export function genericDetail(html, url) { const title = strip(/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] || /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]); const text = strip(html); const locations = [...text.matchAll(/(?:勤務地|勤務地域)\s*[:：]?\s*([^\n]{2,80})/g)].map(match => match[1]); return { title, locations, description: text, sourceUrl: url, rawData: { parser: 'generic_html' } }; }
