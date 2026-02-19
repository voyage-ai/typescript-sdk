import { BasicAuth, BearerToken } from "../../src/core/auth";
import { getHeader } from "../../src/core/fetcher";

describe("BasicAuth tests", () => {
    test("toAuthorizationHeader - undefined", async () => {
        const result = BasicAuth.toAuthorizationHeader(undefined);
        expect(result).toBeUndefined();
    });

    test("toAuthorizationHeader - simple", async () => {
        const result = BasicAuth.toAuthorizationHeader({ username: "foo", password: "bar" });
        const expected = "Basic Zm9vOmJhcg==";
        expect(result).toBe(expected);
    });

    it("should handle special characters in username and password", () => {
        const basicAuth = { username: "user@example.com", password: "p@ssw0rd!" }
        const expectedToken = Buffer.from("user@example.com:p@ssw0rd!").toString("base64")
        expect(BasicAuth.toAuthorizationHeader(basicAuth)).toBe(`Basic ${expectedToken}`)
      })
  
    test("fromAuthorizationHeader - bad input, test", async () => {
        expect(() => {
            const result = BasicAuth.fromAuthorizationHeader("Basic dGVzdA==");
        }).toThrow(Error);
    });

    test("fromAuthorizationHeader - bad input, prefix", async () => {
        expect(() => {
            const result = BasicAuth.fromAuthorizationHeader("Something dGVzdA==");
        }).toThrow(Error);
    });

    test("fromAuthorizationHeader - simple", async () => {
        const result = BasicAuth.fromAuthorizationHeader("Basic Zm9vOmJhcg==");
        expect(result.username).toBe("foo");
        expect(result.password).toBe("bar");
    });
});

describe("BearerToken tests", () => {
    test("toAuthorizationHeader - undefined", async () => {
        const result = BearerToken.toAuthorizationHeader(undefined);
        expect(result).toBeUndefined();
    });

    test("toAuthorizationHeader - simple", async () => {
        const result = BearerToken.toAuthorizationHeader("dGVzdA==");
        const expected = "Bearer dGVzdA==";
        expect(result).toBe(expected);
    });

    test("fromAuthorizationHeader - bad simple", async () => {
        const result = BearerToken.fromAuthorizationHeader("Bearer dGVzdA==");
        expect(result).toBe("dGVzdA==");
    });

    test("fromAuthorizationHeader - simple", async () => {
        const result = BearerToken.fromAuthorizationHeader("Anything Zm9vOmJhcg==");
        expect(result).toBe("Anything Zm9vOmJhcg==");  // This should throw an exception instead imo
    });

    test("fromAuthorizationHeader - simple", async () => {
        const result = BearerToken.fromAuthorizationHeader("test");
        expect(result).toBe("test");  // This should throw an exception instead imo
    });

    test("toAuthorizationHeader - with empty string", () => {
        const result = BearerToken.toAuthorizationHeader("")
        expect(result).toBe("Bearer ")  // should throw an error - empty bearer token??
    })

    test("fromAuthorizationHeader - with extra spaces", () => {
        const result = BearerToken.fromAuthorizationHeader("Bearer    myToken   ")
        expect(result).toBe("myToken")
    })
});

describe("getHeader tests", () => {
    test("getHeader - case insensitive match", () => {
        const headers = {
            "Content-Type": "application/json",
            "X-Custom-Header": "custom value"
        }
        const result = getHeader(headers, "content-type")
        expect(result).toBe("application/json")
    })

    test("getHeader - exact match", () => {
        const headers = {
            "Authorization": "Bearer token123",
            "X-API-Key": "apikey456"
        }
        const result = getHeader(headers, "X-API-Key")
        expect(result).toBe("apikey456")
    })

    test("getHeader - header not found", () => {
        const headers = {
            "Content-Type": "application/json"
        }
        const result = getHeader(headers, "Authorization")
        expect(result).toBeUndefined()
    })

    test("getHeader - empty headers object", () => {
        const headers = {}
        const result = getHeader(headers, "Content-Type")
        expect(result).toBeUndefined()
    })

    test("getHeader - multiple headers with same case-insensitive name", () => {
        const headers = {
            "X-Custom-Header": "value1",
            "x-custom-header": "value2"
        }
        const result = getHeader(headers, "X-Custom-Header")
        expect(result).toBe("value1")
    })
})
