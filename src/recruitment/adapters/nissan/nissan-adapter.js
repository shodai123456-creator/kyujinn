import { nissanDetail, nissanList } from './nissan-parser.js';
export const nissanAdapter = { list: (source, html) => nissanList(html, source.entryUrl).map(item => ({ ...item, sourceUrl: item.url })), detail: (source, html, item) => nissanDetail(html, item.sourceUrl) };
export default nissanAdapter;
