import { itSchemaIdentity } from "../itSchema";
import { itValidate } from "../itValidate";
import { boolean } from "../../../../src/core/schemas";

describe("boolean", () => {
    itSchemaIdentity(boolean(), true);

    itValidate("non-boolean", boolean(), {}, [
        {
            path: [],
            message: "Expected boolean. Received object.",
        },
    ]);
});
