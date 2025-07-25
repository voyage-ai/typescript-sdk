/**
 * This file was auto-generated by Fern from our API Definition.
 */

import * as serializers from "../index";
import * as VoyageAI from "../../api/index";
import * as core from "../../core";

export const ContextualizedEmbedRequestInputType: core.serialization.Schema<
    serializers.ContextualizedEmbedRequestInputType.Raw,
    VoyageAI.ContextualizedEmbedRequestInputType
> = core.serialization.enum_(["query", "document"]);

export declare namespace ContextualizedEmbedRequestInputType {
    type Raw = "query" | "document";
}
