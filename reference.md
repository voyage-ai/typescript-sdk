# Reference

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
    model: "model",
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

##

## Endpoints

<details><summary><code>client.endpoints.<a href="/src/api/resources/endpoints/client/Client.ts">multimodalembeddingsApi</a>({ ...params }) -> VoyageAI.MultimodalembeddingsApiResponse</code></summary>
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
await client.endpoints.multimodalembeddingsApi({
    inputs: [{}],
    model: "model",
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

**request:** `VoyageAI.MultimodalembeddingsApiRequest`

</dd>
</dl>

<dl>
<dd>

**requestOptions:** `Endpoints.RequestOptions`

</dd>
</dl>
</dd>
</dl>

</dd>
</dl>
</details>
