import { type HttpFetcher, type NetworkAddressResolver } from "./public-http-fetch.js";
import type { WebDocumentFetchPort } from "../runs/web-document-fetch-port.js";
export interface PublicWebDocumentDependencies {
    resolver?: NetworkAddressResolver;
    fetcher?: HttpFetcher;
    now?: () => Date;
    maxRedirects?: number;
}
export declare function createPublicWebDocumentAdapter(dependencies?: PublicWebDocumentDependencies): WebDocumentFetchPort;
//# sourceMappingURL=public-web-document.d.ts.map