/**
 * This file was auto-generated by Fern from our API Definition.
 */

import * as serializers from "../index";
import * as VoyageAI from "../../api/index";
import * as core from "../../core";
import { MultimodalEmbedResponseDataItem } from "./MultimodalEmbedResponseDataItem";
import { MultimodalEmbedResponseUsage } from "./MultimodalEmbedResponseUsage";

export const MultimodalEmbedResponse: core.serialization.ObjectSchema<
    serializers.MultimodalEmbedResponse.Raw,
    VoyageAI.MultimodalEmbedResponse
> = core.serialization.object({
    object: core.serialization.string().optional(),
    data: core.serialization.list(MultimodalEmbedResponseDataItem).optional(),
    model: core.serialization.string().optional(),
    usage: MultimodalEmbedResponseUsage.optional(),
});

export declare namespace MultimodalEmbedResponse {
    interface Raw {
        object?: string | null;
        data?: MultimodalEmbedResponseDataItem.Raw[] | null;
        model?: string | null;
        usage?: MultimodalEmbedResponseUsage.Raw | null;
    }
}
