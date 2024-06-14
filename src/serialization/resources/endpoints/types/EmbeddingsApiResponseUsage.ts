/**
 * This file was auto-generated by Fern from our API Definition.
 */

import * as serializers from "../../../index";
import * as VoyageApi from "../../../../api/index";
import * as core from "../../../../core";

export const EmbeddingsApiResponseUsage: core.serialization.ObjectSchema<
    serializers.EmbeddingsApiResponseUsage.Raw,
    VoyageApi.EmbeddingsApiResponseUsage
> = core.serialization.object({
    totalTokens: core.serialization.property("total_tokens", core.serialization.number().optional()),
});

export declare namespace EmbeddingsApiResponseUsage {
    interface Raw {
        total_tokens?: number | null;
    }
}