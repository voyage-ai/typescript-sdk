# Reference
<details><summary><code>client.<a href="/src/Client.ts">embed</a>({ ...params }) -> VoyageAI.EmbedResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Voyage embedding endpoint receives as input a string (or a list of strings) and other arguments such as the preferred model name, and returns a response containing a list of embeddings.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.embed({
    input: "input",
    model: "model"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `VoyageAI.EmbedRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `VoyageAIClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.<a href="/src/Client.ts">rerank</a>({ ...params }) -> VoyageAI.RerankResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Voyage reranker endpoint receives as input a query, a list of documents, and other arguments such as the model name, and returns a response containing the reranking results.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.rerank({
    query: "query",
    documents: ["documents"],
    model: "model"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `VoyageAI.RerankRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `VoyageAIClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.<a href="/src/Client.ts">multimodalEmbed</a>({ ...params }) -> VoyageAI.MultimodalEmbedResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The Voyage multimodal embedding endpoint returns vector representations for a given list of multimodal inputs consisting of text, images, or an interleaving of both modalities.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.multimodalEmbed({
    inputs: [{}],
    model: "model"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `VoyageAI.MultimodalEmbedRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `VoyageAIClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.<a href="/src/Client.ts">contextualizedEmbed</a>({ ...params }) -> VoyageAI.ContextualizedEmbedResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The Voyage contextualized embeddings endpoint receives as input a list of documents (each document is a list of chunks), and returns contextualized embeddings for each chunk. The embeddings capture both the local chunk content and the global document context, making them particularly effective for retrieval tasks where understanding document-level context is important.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.contextualizedEmbed({
    inputs: [["inputs"]],
    model: "model"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `VoyageAI.ContextualizedEmbedRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `VoyageAIClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>
