import { itSchemaIdentity } from "../itSchema";
import { any } from "../../../../src/core/schemas";

describe("any", () => {
    itSchemaIdentity(any(), true);
});
