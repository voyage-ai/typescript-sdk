## Embeddings

<details><summary> <code>client.<a href="./src/Client.ts">embed</a>({ ...params }) -> VoyageAI.EmbedResponse</code> </summary>

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

```ts
await client.embed({
    input: "input",
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

**request: `VoyageAI.EmbedRequest`**

</dd>

</dl>

<dl>

<dd>

**requestOptions: `VoyageAIClient.RequestOptions`**

</dd>

</dl>

</dd>

</dl>

</dd>

</dl>
</details>

## Reranker

<details><summary> <code>client.<a href="./src/Client.ts">rerank</a>({ ...params }) -> VoyageAI.RerankResponse</code> </summary>

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

```ts
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

**request: `VoyageAI.RerankRequest`**

</dd>

</dl>

<dl>

<dd>

**requestOptions: `VoyageAIClient.RequestOptions`**

</dd>

</dl>

</dd>

</dl>

</dd>

</dl>
</details>
