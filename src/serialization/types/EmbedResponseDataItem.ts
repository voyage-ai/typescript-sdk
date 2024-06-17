/**
 * This file was auto-generated by Fern from our API Definition.
 */

import * as serializers from "../index";
import * as Voyage from "../../api/index";
import * as core from "../../core";

export const EmbedResponseDataItem: core.serialization.ObjectSchema<
    serializers.EmbedResponseDataItem.Raw,
    Voyage.EmbedResponseDataItem
> = core.serialization.object({
    object: core.serialization.string().optional(),
    embedding: core.serialization.list(core.serialization.number()).optional(),
    index: core.serialization.number().optional(),
});

export declare namespace EmbedResponseDataItem {
    interface Raw {
        object?: string | null;
        embedding?: number[] | null;
        index?: number | null;
    }
}
