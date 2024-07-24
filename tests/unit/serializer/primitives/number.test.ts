import { itSchemaIdentity } from "../itSchema";
import { itValidate } from "../itValidate";
import { number } from "../../../../src/core/schemas";

describe("number", () => {
    itSchemaIdentity(number(), 42);

    itValidate("non-number", number(), "hello", [
        {
            path: [],
            message: 'Expected number. Received "hello".',
        },
    ]);
});
