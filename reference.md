## Embeddings

<details><summary> <code>voyageApi.<a href="./src/Client.ts">embed</a>({ ...params }) -> VoyageApi.EmbedResponse</code> </summary>

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
await voyageApi.embed({
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

**request: `VoyageApi.EmbedRequest`**

</dd>

</dl>

<dl>

<dd>

**requestOptions: `VoyageApiClient.RequestOptions`**

</dd>

</dl>

</dd>

</dl>

</dd>

</dl>
</details>

## Reranker

<details><summary> <code>voyageApi.<a href="./src/Client.ts">rerank</a>({ ...params }) -> VoyageApi.RerankResponse</code> </summary>

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
await voyageApi.rerank({
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

**request: `VoyageApi.RerankRequest`**

</dd>

</dl>

<dl>

<dd>

**requestOptions: `VoyageApiClient.RequestOptions`**

</dd>

</dl>

</dd>

</dl>

</dd>

</dl>
</details>
