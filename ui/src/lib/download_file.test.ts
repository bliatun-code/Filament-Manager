import assert from "node:assert/strict";
import test from "node:test";

import { downloadTextFile } from "./download_file";

class FakeBlob {
  readonly parts: BlobPart[];
  readonly options?: BlobPropertyBag;

  constructor(parts: BlobPart[] = [], options?: BlobPropertyBag) {
    this.parts = parts;
    this.options = options;
  }
}

test("downloadTextFile creates a typed blob and clicks a named anchor", () => {
  const clicks: Array<{ href: string; download: string }> = [];
  const revoked: string[] = [];
  const createdBlobs: FakeBlob[] = [];

  downloadTextFile("a,b\n1,2", "inventory.csv", "text/csv;charset=utf-8", {
    Blob: class extends FakeBlob {
      constructor(parts: BlobPart[] = [], options?: BlobPropertyBag) {
        super(parts, options);
        createdBlobs.push(this);
      }
    } as unknown as typeof Blob,
    URL: {
      createObjectURL(blob) {
        assert.equal(blob, createdBlobs[0] as unknown as Blob);
        return "blob:download";
      },
      revokeObjectURL(url) {
        revoked.push(url);
      },
    },
    document: {
      createElement(tagName) {
        assert.equal(tagName, "a");
        return {
          href: "",
          download: "",
          click() {
            clicks.push({ href: this.href, download: this.download });
          },
        };
      },
    },
  });

  assert.deepEqual(createdBlobs[0].parts, ["a,b\n1,2"]);
  assert.equal(createdBlobs[0].options?.type, "text/csv;charset=utf-8");
  assert.deepEqual(clicks, [{ href: "blob:download", download: "inventory.csv" }]);
  assert.deepEqual(revoked, ["blob:download"]);
});

test("downloadTextFile revokes the object URL when clicking fails", () => {
  const revoked: string[] = [];

  assert.throws(
    () =>
      downloadTextFile("{}", "backup.json", "application/json;charset=utf-8", {
        Blob: FakeBlob as unknown as typeof Blob,
        URL: {
          createObjectURL() {
            return "blob:failed";
          },
          revokeObjectURL(url) {
            revoked.push(url);
          },
        },
        document: {
          createElement() {
            return {
              href: "",
              download: "",
              click() {
                throw new Error("blocked");
              },
            };
          },
        },
      }),
    /blocked/,
  );

  assert.deepEqual(revoked, ["blob:failed"]);
});

test("downloadTextFile fails cleanly when browser APIs are unavailable", () => {
  assert.throws(
    () => downloadTextFile("content", "file.txt", "text/plain", {}),
    /File download unavailable/,
  );
});
