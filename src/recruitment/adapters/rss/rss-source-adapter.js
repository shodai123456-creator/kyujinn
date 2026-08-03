import { rssEntries } from './rss-adapter.js';

export default {
  list: (source, xml) => rssEntries(xml, source.entryUrl).map(item => ({ ...item, detailHtml: item.description || '' })),
  detail: (source, html, item) => ({ ...item, sourceUrl: item.sourceUrl, description: item.description || html, rawData: { parser: 'rss' } })
};
