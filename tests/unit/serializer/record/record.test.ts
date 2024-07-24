import { itSchemaIdentity } from "../itSchema";
import { itValidate } from "../itValidate";
import { number, string } from "../../../../src/core/schemas";
import { record } from "../../../../src/core/schemas";

describe("record", () => {
    itSchemaIdentity(record(string(), string()), { hello: "world" });
    itSchemaIdentity(record(number(), string()), { 42: "world" });

    itValidate(
        "non-record",
        record(number(), string()),
        [],
        [
            {
                path: [],
                message: "Expected object. Received list.",
            },
        ]
    );

    itValidate("invalid key type", record(number(), string()), { hello: "world" }, [
        {
            path: ["hello (key)"],
            message: 'Expected number. Received "hello".',
        },
    ]);

    itValidate("invalid value type", record(string(), number()), { hello: "world" }, [
        {
            path: ["hello"],
            message: 'Expected number. Received "world".',
        },
    ]);
});
