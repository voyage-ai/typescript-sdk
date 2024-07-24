import { itSchema } from "../itSchema";
import { stringLiteral } from "../../../../src/core/schemas";
import { string } from "../../../../src/core/schemas";
import { objectWithoutOptionalProperties } from "../../../../src/core/schemas";

describe("objectWithoutOptionalProperties", () => {
    itSchema(
        "all properties are required",
        objectWithoutOptionalProperties({
            foo: string(),
            bar: stringLiteral("bar").optional(),
        }),
        {
            raw: {
                foo: "hello",
            },
            // @ts-expect-error
            parsed: {
                foo: "hello",
            },
        }
    );
});
