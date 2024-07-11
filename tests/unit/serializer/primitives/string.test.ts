import { itSchemaIdentity } from "../itSchema";
import { itValidate } from "../itValidate";
import { string } from "../../../../src/core/schemas";

describe("string", () => {
    itSchemaIdentity(string(), "hello");

    itValidate("non-string", string(), 42, [
        {
            path: [],
            message: "Expected string. Received 42.",
        },
    ]);
});
