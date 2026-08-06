/**
 * SageMaker Marketplace ProductId -> canonical Voyage model-name map (spec §7).
 *
 * The `ProductId` lives on a model package at
 * `InferenceSpecification.Containers[0].ProductId`. Unlike the model-package ARN, it is
 * STABLE across model versions — it changes only when a NEW product is listed, never on a
 * new version of an existing listing. That is why endpoint resolution keys off ProductId
 * rather than the ARN.
 *
 * This table is generated from Voyage's canonical listing config. Regenerate and replace it
 * WHOLESALE whenever a new public listing is added; do not hand-edit individual entries.
 *
 * A ProductId that is absent here is treated as "not a recognized public Voyage listing"
 * and is skipped during discovery (never guessed) — self-built packages (no ProductId) and
 * internal/non-public listings (e.g. the internal voyage-multimodal-3 package) fall into
 * this bucket and must be addressed with an explicit `endpointMap` override.
 *
 * NOTE (VOYAGE-2120): once the serving containers report their identity via the
 * `X-Amzn-SageMaker-Custom-Attributes` response header, this table and the
 * `sagemaker:DescribeModelPackage` permission become unnecessary. Until that model-server
 * release ships across all listings, the ProductId lookup is the mechanism.
 */
export const PRODUCT_MAP: Readonly<Record<string, string>> = {
    "prod-y4kaj66a6dlao": "voyage-4-lite",
    "prod-ell6n53ftqwx4": "voyage-context-4",
    "prod-h4lc2pvzlthkk": "voyage-4",
    "prod-65lrxd7oba7sa": "voyage-context-3",
    "prod-tzspioupwl2d2": "voyage-4-large",
    "prod-ujpah6ilhroas": "voyage-multimodal-3.5",
    "prod-rmhofaqmrd4qo": "voyage-3.5",
    "prod-mxpd3mkajgdda": "voyage-multimodal-3",
    "prod-i236v45nicsbq": "voyage-3.5-lite",
    "prod-chjskxbogjvnu": "rerank-2.5",
    "prod-sgxwknsij44ym": "voyage-3-large",
    "prod-yfgpu44y3vjbi": "rerank-2.5-lite",
    "prod-pszu5e2xl2sgy": "voyage-code-3",
};
