# Reference

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

##
