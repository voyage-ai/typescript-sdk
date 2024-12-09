/**
 * This file was auto-generated by Fern from our API Definition.
 */

import * as serializers from "../index";
import * as VoyageAI from "../../api/index";
import * as core from "../../core";

export const MultimodalEmbedRequestInputsItemContentItem: core.serialization.ObjectSchema<
    serializers.MultimodalEmbedRequestInputsItemContentItem.Raw,
    VoyageAI.MultimodalEmbedRequestInputsItemContentItem
> = core.serialization.object({
    type: core.serialization.string().optional(),
    text: core.serialization.string().optional(),
    imageBase64: core.serialization.property("image_base64", core.serialization.string().optional()),
    imageUrl: core.serialization.property("image_url", core.serialization.string().optional()),
});

export declare namespace MultimodalEmbedRequestInputsItemContentItem {
    interface Raw {
        type?: string | null;
        text?: string | null;
        image_base64?: string | null;
        image_url?: string | null;
    }
}