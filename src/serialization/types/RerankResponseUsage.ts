/**
 * This file was auto-generated by Fern from our API Definition.
 */

import * as serializers from "../index";
import * as VoyageAI from "../../api/index";
import * as core from "../../core";

export const RerankResponseUsage: core.serialization.ObjectSchema<
    serializers.RerankResponseUsage.Raw,
    VoyageAI.RerankResponseUsage
> = core.serialization.object({
    totalTokens: core.serialization.property("total_tokens", core.serialization.number().optional()),
});

export declare namespace RerankResponseUsage {
    interface Raw {
        total_tokens?: number | null;
    }
}