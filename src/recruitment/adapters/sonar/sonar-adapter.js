import { sonarDetail, sonarList } from './sonar-parser.js';
export const sonarAdapter = { list: (source, html) => sonarList(html, source.entryUrl).map(item => ({ ...item, sourceUrl: item.url })), detail: (source, html, item) => sonarDetail(html, item.sourceUrl) };
export default sonarAdapter;
