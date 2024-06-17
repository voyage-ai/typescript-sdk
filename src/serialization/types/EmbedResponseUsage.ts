/**
 * This file was auto-generated by Fern from our API Definition.
 */

import * as serializers from "../index";
import * as Voyage from "../../api/index";
import * as core from "../../core";

export const EmbedResponseUsage: core.serialization.ObjectSchema<
    serializers.EmbedResponseUsage.Raw,
    Voyage.EmbedResponseUsage
> = core.serialization.object({
    totalTokens: core.serialization.property("total_tokens", core.serialization.number().optional()),
});

export declare namespace EmbedResponseUsage {
    interface Raw {
        total_tokens?: number | null;
    }
}
