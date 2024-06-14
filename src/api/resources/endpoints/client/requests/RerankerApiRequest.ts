/**
 * This file was auto-generated by Fern from our API Definition.
 */

/**
 * @example
 *     {
 *         query: "query",
 *         documents: ["documents"],
 *         model: "model"
 *     }
 */
export interface RerankerApiRequest {
    /** The query as a string. The query can contain a maximum of 1000 tokens for `rerank-lite-1` and 2000 tokens for `rerank-1`. */
    query: string;
    /** The documents to be reranked as a list of strings. <ul> <li><p> The number of documents cannot exceed 1000. </p> </li> <li> <p> The sum of the number of tokens in the query and the number of tokens in any single document cannot exceed 4000 for `rerank-lite-1` and 8000 for `rerank-1`. </p> </li> <li> <p>The total number of tokens, defined as "the number  of query tokens × the number of documents + sum of the number  of tokens in all documents", cannot exceed 300K for `rerank-lite-1` and 100K for `rerank-1`. Please see our <a href="https://docs.voyageai.com/docs/faq#what-is-the-total-number-of-tokens-for-the-rerankers">FAQ</a>. </p> </li> </ul> */
    documents: string[];
    /** Name of the model. Recommended options: `rerank-lite-1`, `rerank-1`. */
    model: string;
    /** The number of most relevant documents to return. If not specified, the reranking results of all documents will be returned. */
    topK?: number;
    /** Whether to return the documents in the response. Defaults to `false`. <ul> <li> <p> If `false`, the API will return a list of {"index", "relevance_score"} where "index" refers to the index of a document within the input list. </p> </li> <li> <p> If `true`, the API will return a list of {"index", "document", "relevance_score"} where "document" is the corresponding document from the input list.  </p> </li> </ul> */
    returnDocuments?: boolean;
    /** Whether to truncate the input to satisfy the "context length limit" on the query and the documents. Defaults to `true`. <ul> <li> <p> If `true`,  the query and documents will be truncated to fit within the context length limit, before processed by the reranker model. </p> </li> <li> <p> If `false`, an error will be raised when the query exceeds 1000 tokens for `rerank-lite-1` and 2000 tokens for `rerank-1`, or the sum of the number of tokens in the query and the number of tokens in any single document exceeds 4000 for `rerank-lite-1` and 8000 for `rerank-1`. </p> </li> </ul> */
    truncation?: boolean;
}