import { jpostingDetail, jpostingList } from './jposting-parser.js';
export const jpostingAdapter = { list: (source, html) => jpostingList(html, source.entryUrl).map(item => ({ ...item, sourceUrl: item.url })), detail: (source, html, item) => jpostingDetail(html, item.sourceUrl) };
export default jpostingAdapter;
