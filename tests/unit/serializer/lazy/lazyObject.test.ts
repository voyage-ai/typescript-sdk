import { itSchemaIdentity } from "../itSchema";
import { object } from "../../../../src/core/schemas";
import { number, string } from "../../../../src/core/schemas";
import { lazyObject } from "../../../../src/core/schemas";

describe("lazy", () => {
    itSchemaIdentity(
        lazyObject(() => object({ foo: string() })),
        { foo: "hello" }
    );

    itSchemaIdentity(
        lazyObject(() => object({ foo: string() })).extend(object({ bar: number() })),
        {
            foo: "hello",
            bar: 42,
        },
        { title: "returned schema has object utils" }
    );
});
