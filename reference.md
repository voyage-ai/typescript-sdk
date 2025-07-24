# Reference

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

##

## Endpoints

<details><summary><code>client.endpoints.<a href="/src/api/resources/endpoints/client/Client.ts">contextualizedembeddingsApi</a>({ ...params }) -> VoyageAI.ContextualizedembeddingsApiResponse</code></summary>
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
await client.endpoints.contextualizedembeddingsApi({
    inputs: [["inputs"]],
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

**request:** `VoyageAI.ContextualizedembeddingsApiRequest`

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
