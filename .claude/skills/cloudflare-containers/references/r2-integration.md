# R2 Integration

Containers cannot directly access Worker bindings. Use these patterns to access R2 storage.

## Option 1: S3-Compatible API

Use R2's S3 API with credentials passed as environment variables. Works with any S3-compatible library.

### Setup

1. Create R2 API token in Cloudflare dashboard (R2 > Manage R2 API Tokens)
2. Store credentials as secrets:

```bash
npx wrangler secret put AWS_ACCESS_KEY_ID
npx wrangler secret put AWS_SECRET_ACCESS_KEY
```

3. Configure wrangler.jsonc:

```jsonc
{
  "vars": {
    "R2_BUCKET_NAME": "my-bucket",
    "R2_ACCOUNT_ID": "your-account-id",
  },
}
```

### Container Class

```typescript
export class MyContainer extends Container<Env> {
  defaultPort = 8000;
  envVars = {
    AWS_ACCESS_KEY_ID: this.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: this.env.AWS_SECRET_ACCESS_KEY,
    R2_ENDPOINT: `https://${this.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    R2_BUCKET: this.env.R2_BUCKET_NAME,
  };
}
```

### Python (boto3)

```python
import boto3
import os

s3 = boto3.client(
    's3',
    endpoint_url=os.environ['R2_ENDPOINT'],
    aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
    aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY']
)

# Upload
s3.upload_file('/tmp/output.zip', os.environ['R2_BUCKET'], 'output.zip')

# Download
s3.download_file(os.environ['R2_BUCKET'], 'input.zip', '/tmp/input.zip')

# List objects
response = s3.list_objects_v2(Bucket=os.environ['R2_BUCKET'], Prefix='data/')
for obj in response.get('Contents', []):
    print(obj['Key'], obj['Size'])

# Generate presigned URL (for returning to client)
url = s3.generate_presigned_url(
    'get_object',
    Params={'Bucket': os.environ['R2_BUCKET'], 'Key': 'output.zip'},
    ExpiresIn=3600
)
```

### Node.js (@aws-sdk/client-s3)

```javascript
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Download
const response = await s3.send(
  new GetObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: "input.zip",
  }),
);
const data = await response.Body.transformToByteArray();

// Upload
await s3.send(
  new PutObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: "output.zip",
    Body: fileBuffer,
  }),
);
```

---

## Option 2: FUSE Mount (Filesystem Access)

Mount R2 as a local filesystem using tigrisfs. Files appear at `/mnt/r2/` and can be accessed with standard file operations.

### Use Cases

- Bootstrapping containers with assets
- Persisting state across container restarts
- Working with large static files
- Sharing files between container instances

### Dockerfile

```dockerfile
FROM alpine:3.20

# Install FUSE and tigrisfs
RUN apk update && apk add --no-cache ca-certificates fuse curl bash

RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then ARCH="amd64"; fi && \
    VERSION=$(curl -s https://api.github.com/repos/tigrisdata/tigrisfs/releases/latest | grep -o '"tag_name": "[^"]*' | cut -d'"' -f4) && \
    curl -L "https://github.com/tigrisdata/tigrisfs/releases/download/${VERSION}/tigrisfs_${VERSION#v}_linux_${ARCH}.tar.gz" -o /tmp/tigrisfs.tar.gz && \
    tar -xzf /tmp/tigrisfs.tar.gz -C /usr/local/bin/ && \
    rm /tmp/tigrisfs.tar.gz && chmod +x /usr/local/bin/tigrisfs

# Startup script that mounts bucket before running app
RUN printf '#!/bin/sh\n\
set -e\n\
mkdir -p /mnt/r2\n\
R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"\n\
/usr/local/bin/tigrisfs --endpoint "${R2_ENDPOINT}" -f "${BUCKET_NAME}" /mnt/r2 &\n\
sleep 3\n\
exec "$@"\n\
' > /startup.sh && chmod +x /startup.sh

ENTRYPOINT ["/startup.sh"]
CMD ["your-app"]
```

### Container Class

```typescript
export class FUSEContainer extends Container<Env> {
  defaultPort = 8000;
  sleepAfter = "10m";
  envVars = {
    AWS_ACCESS_KEY_ID: this.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: this.env.AWS_SECRET_ACCESS_KEY,
    BUCKET_NAME: this.env.R2_BUCKET_NAME,
    R2_ACCOUNT_ID: this.env.R2_ACCOUNT_ID,
  };
}
```

### wrangler.jsonc

```jsonc
{
  "name": "fuse-container",
  "main": "src/index.ts",
  "compatibility_date": "2025-11-14",
  "vars": {
    "R2_BUCKET_NAME": "my-bucket",
    "R2_ACCOUNT_ID": "your-account-id",
  },
  "containers": [
    {
      "class_name": "FUSEContainer",
      "image": "./container/Dockerfile",
      "max_instances": 5,
      "instance_type": "standard-1",
    },
  ],
  "durable_objects": {
    "bindings": [{ "class_name": "FUSEContainer", "name": "FUSE_CONTAINER" }],
  },
  "migrations": [{ "new_sqlite_classes": ["FUSEContainer"], "tag": "v1" }],
}
```

### Using Mounted Files

```python
# Files are accessible at /mnt/r2/
import os
from pathlib import Path

R2_MOUNT = Path("/mnt/r2")

# Read file
data = (R2_MOUNT / "config.json").read_text()

# Write file (syncs to R2)
(R2_MOUNT / "output/result.json").write_text('{"status": "done"}')

# List files
for f in (R2_MOUNT / "data").iterdir():
    print(f.name, f.stat().st_size)
```

### Read-Only Mount

For read-only access (bootstrap assets, config files), add `-o ro` flag:

```dockerfile
/usr/local/bin/tigrisfs --endpoint "${R2_ENDPOINT}" -f -o ro "${BUCKET_NAME}" /mnt/r2 &
```

---

## Option 3: Presigned URLs (Pass-through)

Generate presigned URLs in the Worker and pass them to the container. Best for one-off file access.

### Worker

```typescript
import { getContainer } from "@cloudflare/containers";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { key } = await request.json();

    // Generate presigned URL for container to use
    const presignedUrl = await env.R2_BUCKET.createPresignedUrl(key, {
      expiresIn: 3600,
    });

    const container = getContainer(env.MY_CONTAINER, "processor");

    return container.fetch(
      new Request("http://container/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_url: presignedUrl }),
      }),
    );
  },
};
```

### Container

```python
import httpx

@app.post("/process")
async def process(req: dict):
    file_url = req["file_url"]

    # Download using presigned URL
    async with httpx.AsyncClient() as client:
        response = await client.get(file_url)
        data = response.content

    # Process data...
    return {"processed": True}
```

---

## Comparison

| Approach       | Best For                            | Complexity | Performance |
| -------------- | ----------------------------------- | ---------- | ----------- |
| S3 API (boto3) | Programmatic access, multiple files | Low        | Good        |
| FUSE Mount     | File-based workflows, large files   | Medium     | Good        |
| Presigned URLs | One-off access, simple pass-through | Low        | Extra hop   |
