## Endpoints

<details><summary> <code>voyageApi.endpoints.<a href="./src/api/resources/endpoints/client/Client.ts">embeddingsApi</a>({ ...params }) -> VoyageApi.EmbeddingsApiResponse</code> </summary>

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
await voyageApi.endpoints.embeddingsApi({
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

**request: `VoyageApi.EmbeddingsApiRequest`**

</dd>

</dl>

<dl>

<dd>

**requestOptions: `Endpoints.RequestOptions`**

</dd>

</dl>

</dd>

</dl>

</dd>

</dl>
</details>

<details><summary> <code>voyageApi.endpoints.<a href="./src/api/resources/endpoints/client/Client.ts">rerankerApi</a>({ ...params }) -> VoyageApi.RerankerApiResponse</code> </summary>

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
await voyageApi.endpoints.rerankerApi({
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

**request: `VoyageApi.RerankerApiRequest`**

</dd>

</dl>

<dl>

<dd>

**requestOptions: `Endpoints.RequestOptions`**

</dd>

</dl>

</dd>

</dl>

</dd>

</dl>
</details>
