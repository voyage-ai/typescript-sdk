/**
 * This file was auto-generated by Fern from our API Definition.
 */

import * as serializers from "../index";
import * as VoyageAI from "../../api/index";
import * as core from "../../core";

export const EmbedRequestInputType: core.serialization.Schema<
    serializers.EmbedRequestInputType.Raw,
    VoyageAI.EmbedRequestInputType
> = core.serialization.enum_(["query", "document"]);

export declare namespace EmbedRequestInputType {
    type Raw = "query" | "document";
}
