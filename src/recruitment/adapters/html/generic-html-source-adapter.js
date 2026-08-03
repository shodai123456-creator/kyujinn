import { genericDetail, linksFromHtml } from './generic-html-adapter.js';

export default {
  list: (source, html) => linksFromHtml(html, source.entryUrl).map(item => ({ sourceUrl: item.url, title: item.title })),
  detail: (source, html, item) => genericDetail(html, item.sourceUrl)
};
