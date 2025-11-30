// src/index.js (edited portion)
const PORT = process.env.PORT || 4000;
// You can set a comma-separated list in Render env var, e.g.
// CORS_ORIGIN=https://chatsaathi.vercel.app,https://www.chatsaathi.vercel.app,http://localhost:3000
const CORS_ORIGIN = process.env.CORS_ORIGIN || "https://chatsaathi.vercel.app";

const allowedOrigins = CORS_ORIGIN.split(",").map(o => o.trim()).filter(Boolean);

async function start() {
  const io = new Server(server, {
    cors: {
      origin: function(origin, callback) {
        // allow requests with no origin (e.g. mobile apps, curl)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error("CORS origin not allowed"));
      },
      credentials: true,
    },
  });

  app.set("io", io);

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (!origin) {
      // no origin (server-to-server or curl) — allow
      res.setHeader("Access-Control-Allow-Origin", "*");
    } else if (allowedOrigins.includes(origin)) {
      // echo back exact origin (required when credentials: true)
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }
    next();
  });

  // If you prefer to use the cors package you can also:
  // app.use(cors({ origin: (origin, cb) => { ...same logic... }, credentials: true }));
  app.use(express.json());
  ...
}

