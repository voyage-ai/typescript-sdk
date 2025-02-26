/**
 * This file was auto-generated by Fern from our API Definition.
 */

import * as serializers from "../index";
import * as VoyageAI from "../../api/index";
import * as core from "../../core";

export const EmbedRequestOutputDtype: core.serialization.Schema<
    serializers.EmbedRequestOutputDtype.Raw,
    VoyageAI.EmbedRequestOutputDtype
> = core.serialization.enum_(["float", "int8", "uint8", "binary", "ubinary"]);

export declare namespace EmbedRequestOutputDtype {
    type Raw = "float" | "int8" | "uint8" | "binary" | "ubinary";
}
