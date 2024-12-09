/**
 * This file was auto-generated by Fern from our API Definition.
 */

import * as VoyageAI from "../../index";

/**
 * @example
 *     {
 *         inputs: [{}],
 *         model: "model"
 *     }
 */
export interface MultimodalEmbedRequest {
    /**
     * A list of multimodal inputs to be vectorized.
     * A single input in the list is a dictionary containing a single key "content", whose value represents a sequence of text and images.
     * <ul><p></p>
     *   <li> The value of&nbsp;<code class="rdmd-code lang- theme-light" data-lang="" name="" tabindex="0"><span class="cm-s-neo" data-testid="SyntaxHighlighter">"content"</span></code>&nbsp;is a list of dictionaries, each representing a single piece of text or image. The dictionaries have four possible keys:
     *       <ol class="nested-ordered-list">
     *           <li> <b>type</b>: Specifies the type of the piece of the content. Allowed values are <code class="rdmd-code lang- theme-light" data-lang="" name="" tabindex="0"><span class="cm-s-neo" data-testid="SyntaxHighlighter">text</span></code>, <code class="rdmd-code lang- theme-light" data-lang="" name="" tabindex="0"><span class="cm-s-neo" data-testid="SyntaxHighlighter">image_url</span></code>, or <code class="rdmd-code lang- theme-light" data-lang="" name="" tabindex="0"><span class="cm-s-neo" data-testid="SyntaxHighlighter">image_base64</span></code>.</li>
     *           <li> <b>text</b>: Only present when <code class="rdmd-code lang- theme-light" data-lang="" name="" tabindex="0"><span class="cm-s-neo" data-testid="SyntaxHighlighter">type</span></code> is <code class="rdmd-code lang- theme-light" data-lang="" name="" tabindex="0"><span class="cm-s-neo" data-testid="SyntaxHighlighter">text</span></code>. The value should be a text string.</li>
     *           <li> <b>image_base64</b>: Only present when <code class="rdmd-code lang- theme-light" data-lang="" name="" tabindex="0"><span class="cm-s-neo" data-testid="SyntaxHighlighter">type</span></code> is <code class="rdmd-code lang- theme-light" data-lang="" name="" tabindex="0"><span class="cm-s-neo" data-testid="SyntaxHighlighter">image_base64</span></code>. The value should be a Base64-encoded image in the <a target="_blank" href="https://developer.mozilla.org/en-US/docs/Web/URI/Schemes/data">data URL</a> format <code class="rdmd-code lang- theme-light" data-lang="" name="" tabindex="0"><span class="cm-s-neo" data-testid="SyntaxHighlighter">data:[&lt;mediatype&gt;];base64,&lt;data&gt;</span></code>. Currently supported <code class="rdmd-code lang- theme-light" data-lang="" name="" tabindex="0"><span class="cm-s-neo" data-testid="SyntaxHighlighter">mediatypes</span></code> are: <code class="rdmd-code lang- theme-light" data-lang="" name="" tabindex="0"><span class="cm-s-neo" data-testid="SyntaxHighlighter">image/png</span></code>, <code class="rdmd-code lang- theme-light" data-lang="" name="" tabindex="0"><span class="cm-s-neo" data-testid="SyntaxHighlighter">image/jpeg</span></code>, <code class="rdmd-code lang- theme-light" data-lang="" name="" tabindex="0"><span class="cm-s-neo" data-testid="SyntaxHighlighter">image/webp</span></code>, and <code class="rdmd-code lang- theme-light" data-lang="" name="" tabindex="0"><span class="cm-s-neo" data-testid="SyntaxHighlighter">image/gif</span></code>.</li>
     *           <li> <b>image_url</b>: Only present when <code class="rdmd-code lang- theme-light" data-lang="" name="" tabindex="0"><span class="cm-s-neo" data-testid="SyntaxHighlighter">type</span></code> is <code class="rdmd-code lang- theme-light" data-lang="" name="" tabindex="0"><span class="cm-s-neo" data-testid="SyntaxHighlighter">image_url</span></code>. The value should be a URL linking to the image. We support PNG, JPEG, WEBP, and GIF images.</li>
     *       </ol>
     *   </li>
     *   <li> <b>Note</b>: Only one of the keys, <code class="rdmd-code lang- theme-light" data-lang="" name="" tabindex="0"><span class="cm-s-neo" data-testid="SyntaxHighlighter">image_base64</span></code> or <code class="rdmd-code lang- theme-light" data-lang="" name="" tabindex="0"><span class="cm-s-neo" data-testid="SyntaxHighlighter">image_url</span></code>, should be present in each dictionary for image data. Consistency is required within a request, meaning each request should use either <code class="rdmd-code lang- theme-light" data-lang="" name="" tabindex="0"><span class="cm-s-neo" data-testid="SyntaxHighlighter">image_base64</span></code> or <code class="rdmd-code lang- theme-light" data-lang="" name="" tabindex="0"><span class="cm-s-neo" data-testid="SyntaxHighlighter">image_url</span></code> exclusively for images, not both.<br>
     *   <br>
     *   <details> <summary> Example payload where <code class="rdmd-code lang- theme-light" data-lang="" name="" tabindex="0"><span class="cm-s-neo" data-testid="SyntaxHighlighter">inputs</span></code>&nbsp;contains an image as a URL </summary>
     *       <br>
     *       The <code class="rdmd-code lang- theme-light" data-lang="" name="" tabindex="0"><span class="cm-s-neo" data-testid="SyntaxHighlighter">inputs</span></code> list contains a single input, which consists of a piece of text and an image (which is provided via a URL).
     *       <pre><code class="rdmd-code lang- theme-light" data-lang="" name="" tabindex="0"><span class="cm-s-neo" data-testid="SyntaxHighlighter">
     *       {
     *         "inputs": [
     *           {
     *             "content": [
     *               {
     *                 "type": "text",
     *                 "text": "This is a banana."
     *               },
     *               {
     *                 "type": "image_url",
     *                 "image_url": "https://raw.githubusercontent.com/voyage-ai/voyage-multimodal-3/refs/heads/main/images/banana.jpg"
     *               }
     *             ]
     *           }
     *         ],
     *         "model": "voyage-multimodal-3"
     *       }
     *       </span></code></pre>
     *   </details>
     *   <details> <summary> Example payload where <code class="rdmd-code lang- theme-light" data-lang="" name="" tabindex="0"><span class="cm-s-neo" data-testid="SyntaxHighlighter">inputs</span></code>&nbsp;contains a Base64 image </summary>
     *       <br>
     *       Below is an equivalent example to the one above where the image content is a Base64 image instead of a URL. (Base64 images can be lengthy, so the example only shows a shortened version.)
     *       <pre><code class="rdmd-code lang- theme-light" data-lang="" name="" tabindex="0"><span class="cm-s-neo" data-testid="SyntaxHighlighter">
     *       {
     *         "inputs": [
     *           {
     *             "content": [
     *               {
     *                 "type": "text",
     *                 "text": "This is a banana."
     *               },
     *               {
     *                 "type": "image_base64",
     *                 "image_base64": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAA..."
     *               }
     *             ]
     *           }
     *         ],
     *         "model": "voyage-multimodal-3"
     *       }
     *       </span></code></pre>
     *   </details>
     *   </li>
     * </ul>
     *
     */
    inputs: VoyageAI.MultimodalEmbedRequestInputsItem[];
    /**
     * Name of the model. Currently, the only supported model is `voyage-multimodal-3`.
     *
     */
    model: string;
    /**
     * Type of the input text. Defaults to `null`. Other options: `query`, `document`.
     * <ul> <li> When <code class="rdmd-code lang- theme-light" data-lang="" name="" tabindex="0"><span class="cm-s-neo" data-testid="SyntaxHighlighter">input_type</span></code> is <code class="rdmd-code lang- theme-light" data-lang="" name="" tabindex="0"><span class="cm-s-neo" data-testid="SyntaxHighlighter">null</span></code>, the embedding model directly converts your input data into numerical vectors. For retrieval/search purposes—where an input (called a "query") is used to search for relevant pieces of information (referred to as "documents")—we recommend specifying whether your inputs are intended as queries or documents by setting <code class="rdmd-code lang- theme-light" data-lang="" name="" tabindex="0"><span class="cm-s-neo" data-testid="SyntaxHighlighter">input_type</span></code> to <code class="rdmd-code lang- theme-light" data-lang="" name="" tabindex="0"><span class="cm-s-neo" data-testid="SyntaxHighlighter">query</span></code> or <code class="rdmd-code lang- theme-light" data-lang="" name="" tabindex="0"><span class="cm-s-neo" data-testid="SyntaxHighlighter">document</span></code>, respectively. In these cases, Voyage prepends a prompt to your input before vectorizing it, helping the model create more effective vectors tailored for retrieval/search tasks. Since inputs can be multimodal, queries and documents can be text, images, or an interleaving of both modalities. Embeddings generated with and without the <code class="rdmd-code lang- theme-light" data-lang="" name="" tabindex="0"><span class="cm-s-neo" data-testid="SyntaxHighlighter">input_type</span></code> argument are compatible. </li> <li> For transparency, the following prompts are prepended to your input. </li><p></p>
     *   <ul>
     *     <li> For&nbsp;<code class="rdmd-code lang- theme-light" data-lang="" name="" tabindex="0"><span class="cm-s-neo" data-testid="SyntaxHighlighter">query</span></code>, the prompt is <i>"Represent the query for retrieving supporting documents:&nbsp;".</i> </li>
     *     <li> For&nbsp;<code class="rdmd-code lang- theme-light" data-lang="" name="" tabindex="0"><span class="cm-s-neo" data-testid="SyntaxHighlighter">document</span></code>, the prompt is <i>"Represent the query for retrieving supporting documents:&nbsp;".</i> </li>
     *   </ul>
     * <ul></ul></ul>
     *
     */
    inputType?: VoyageAI.MultimodalEmbedRequestInputType;
    /**
     * Whether to truncate the input texts to fit within the context length. Defaults to `true`. <ul>  <li> If `true`, over-length input texts will be truncated to fit within the context length, before vectorized by the embedding model. </li>  <li> If `false`, an error will be raised if any given text exceeds the context length. </li>  </ul>
     *
     */
    truncation?: boolean;
    /**
     * Format in which the embeddings are encoded. We support two options:  <ul> <li> If not specified (defaults to `null`): the embeddings are represented as lists of floating-point numbers; </li>  <li> `base64`: the embeddings are compressed to [base64](https://docs.python.org/3/library/base64.html) encodings. </li>  </ul>
     *
     */
    encodingFormat?: "base64";
}