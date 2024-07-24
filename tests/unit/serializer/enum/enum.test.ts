import { itSchemaIdentity } from "../itSchema";
import { itValidate } from "../itValidate";
import { enum_ } from "../../../../src/core/schemas";

describe("enum", () => {
    itSchemaIdentity(enum_(["A", "B", "C"]), "A");

    itSchemaIdentity(enum_(["A", "B", "C"]), "D" as any, {
        opts: { allowUnrecognizedEnumValues: true },
    });

    itValidate("invalid enum", enum_(["A", "B", "C"]), "D", [
        {
            message: 'Expected enum. Received "D".',
            path: [],
        },
    ]);

    itValidate(
        "non-string",
        enum_(["A", "B", "C"]),
        [],
        [
            {
                message: "Expected string. Received list.",
                path: [],
            },
        ]
    );
});
