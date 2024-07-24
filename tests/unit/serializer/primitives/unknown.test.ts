import { itSchemaIdentity } from "../itSchema";
import { unknown } from "../../../../src/core/schemas";

describe("unknown", () => {
    itSchemaIdentity(unknown(), true);
});
