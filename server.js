const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const port = Number(process.env.PORT || 8000);

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(req.url.split("?")[0]);
  } catch {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }
  const requested = urlPath === "/" ? "/index.html" : urlPath;
  let filePath = path.normalize(path.join(root, requested));

  const relative = path.relative(root, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (!path.extname(filePath)) {
    const indexPath = path.join(filePath, "index.html");
    const htmlPath = `${filePath}.html`;
    if (fs.existsSync(indexPath)) {
      filePath = indexPath;
    } else if (fs.existsSync(htmlPath)) {
      filePath = htmlPath;
    }
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    res.writeHead(200, {
      "Content-Type": types[path.extname(filePath).toLowerCase()] || "application/octet-stream"
    });
    res.end(data);
  });
});

server.listen(port, () => {
  console.log(`Impact Global Agency listo en http://localhost:${server.address().port}`);
});
