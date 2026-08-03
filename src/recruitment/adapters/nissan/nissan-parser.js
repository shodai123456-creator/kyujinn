import { genericDetail, linksFromHtml } from '../html/generic-html-adapter.js';
export const nissanList = (html, url) => linksFromHtml(html, url, /job|career|position|detail/i);
export const nissanDetail = (html, url) => ({ ...genericDetail(html, url), rawData: { parser: 'nissan' } });
