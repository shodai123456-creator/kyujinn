import { genericDetail, linksFromHtml } from '../html/generic-html-adapter.js';
export const sonarList = (html, url) => linksFromHtml(html, url, /entry|job|detail|recruit/i);
export function sonarDetail(html, url) { const job = genericDetail(html, url); const externalJobId = /(?:job|entry|recruit)[_/=]([\w-]+)/i.exec(url)?.[1] || ''; return { ...job, externalJobId, rawData: { parser: 'sonar' } }; }
