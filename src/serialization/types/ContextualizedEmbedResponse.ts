/**
 * This file was auto-generated by Fern from our API Definition.
 */

import * as serializers from "../index";
import * as VoyageAI from "../../api/index";
import * as core from "../../core";
import { ContextualizedEmbedResponseDataItem } from "./ContextualizedEmbedResponseDataItem";
import { ContextualizedEmbedResponseUsage } from "./ContextualizedEmbedResponseUsage";

export const ContextualizedEmbedResponse: core.serialization.ObjectSchema<
    serializers.ContextualizedEmbedResponse.Raw,
    VoyageAI.ContextualizedEmbedResponse
> = core.serialization.object({
    object: core.serialization.string().optional(),
    data: core.serialization.list(ContextualizedEmbedResponseDataItem).optional(),
    model: core.serialization.string().optional(),
    usage: ContextualizedEmbedResponseUsage.optional(),
});

export declare namespace ContextualizedEmbedResponse {
    interface Raw {
        object?: string | null;
        data?: ContextualizedEmbedResponseDataItem.Raw[] | null;
        model?: string | null;
        usage?: ContextualizedEmbedResponseUsage.Raw | null;
    }
}
