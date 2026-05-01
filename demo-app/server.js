const http = require("http");
const { randomUUID } = require("crypto");
const { URL } = require("url");

const port = Number(process.env.PORT || 3000);
const adminApiKey = "qa-lab-admin";
const allowedRoles = ["Member", "Admin", "VIP"];
const userColumns = [
  { column_name: "id", data_type: "uuid", is_nullable: "NO" },
  { column_name: "first_name", data_type: "text", is_nullable: "NO" },
  { column_name: "last_name", data_type: "text", is_nullable: "NO" },
  { column_name: "email", data_type: "character varying", is_nullable: "NO" },
  { column_name: "created_at", data_type: "timestamp with time zone", is_nullable: "NO" },
  { column_name: "nationality", data_type: "text", is_nullable: "NO" },
  { column_name: "role", data_type: "text", is_nullable: "NO" }
];
const userIndexes = [
  {
    indexname: "users_pkey",
    indexdef: "CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id)"
  },
  {
    indexname: "users_email_key",
    indexdef: "CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email)"
  }
];
const seedUsers = [
  {
    id: randomUUID(),
    first_name: "Ava",
    last_name: "Patel",
    email: "ava@example.com",
    created_at: "2026-04-20T09:00:00.000Z",
    nationality: "Indian",
    role: "Admin"
  },
  {
    id: randomUUID(),
    first_name: "Noah",
    last_name: "Kim",
    email: "noah@example.com",
    created_at: "2026-04-21T09:00:00.000Z",
    nationality: "Korean",
    role: "Member"
  },
  {
    id: randomUUID(),
    first_name: "Mia",
    last_name: "Lopez",
    email: "mia@example.com",
    created_at: "2026-04-22T09:00:00.000Z",
    nationality: "Filipino",
    role: "VIP"
  }
];

let users = [];
const contactMessages = [];

const clone = (value) => JSON.parse(JSON.stringify(value));

const resetState = () => {
  users = clone(seedUsers);
  contactMessages.length = 0;
};

resetState();

const readBody = (request) =>
  new Promise((resolve, reject) => {
    let data = "";
    request.on("data", (chunk) => {
      data += chunk;
    });
    request.on("end", () => resolve(data));
    request.on("error", reject);
  });

const send = (response, statusCode, payload, headers = {}) => {
  response.writeHead(statusCode, headers);
  response.end(payload);
};

const json = (response, statusCode, payload, headers = {}) => {
  send(
    response,
    statusCode,
    JSON.stringify(payload),
    { "Content-Type": "application/json; charset=utf-8", ...headers }
  );
};

const noContent = (response, statusCode = 204) => {
  response.writeHead(statusCode);
  response.end();
};

const fullName = (user) => `${user.first_name} ${user.last_name}`.trim();

const matchesFilter = (user, filters) =>
  filters.every(({ field, operator, value }) => {
    const actual = user[field];

    if (operator === "eq") {
      return String(actual) === value;
    }

    return false;
  });

const parseFilters = (searchParams) => {
  const filters = [];

  for (const [field, expression] of searchParams.entries()) {
    if (field === "limit") {
      continue;
    }

    const [operator, ...valueParts] = String(expression).split(".");
    filters.push({
      field,
      operator,
      value: valueParts.join(".")
    });
  }

  return filters;
};

const applyFilters = (records, searchParams) => {
  const filters = parseFilters(searchParams);
  const filtered = filters.length === 0 ? [...records] : records.filter((user) => matchesFilter(user, filters));
  const limit = Number(searchParams.get("limit"));

  if (Number.isFinite(limit) && limit > 0) {
    return filtered.slice(0, limit);
  }

  return filtered;
};

const normalizeUserInput = (payload) => {
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const firstNameFromName = name ? name.split(/\s+/).slice(0, -1).join(" ") || name.split(/\s+/)[0] : "";
  const lastNameFromName = name ? name.split(/\s+/).slice(1).join(" ") || "User" : "";

  return {
    first_name: String(payload.first_name ?? firstNameFromName ?? "").trim(),
    last_name: String(payload.last_name ?? lastNameFromName ?? "").trim(),
    email: String(payload.email ?? "").trim(),
    nationality: String(payload.nationality ?? "Filipino").trim(),
    role: String(payload.role ?? "Member").trim()
  };
};

const validateUserInput = (candidate, options = { requireAllFields: true }) => {
  const errors = [];

  if (options.requireAllFields) {
    for (const field of ["first_name", "last_name", "email", "nationality", "role"]) {
      if (!candidate[field]) {
        errors.push(`${field} is required`);
      }
    }
  }

  if (candidate.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(candidate.email)) {
    errors.push("email must be valid");
  }

  if (candidate.role && !allowedRoles.includes(candidate.role)) {
    errors.push("role must be one of Member, Admin, VIP");
  }

  if (candidate.first_name === "" || candidate.last_name === "") {
    errors.push("name fields cannot be empty");
  }

  return errors;
};

const createUser = (payload, options = { validate: true }) => {
  const candidate = normalizeUserInput(payload);
  const errors = options.validate ? validateUserInput(candidate) : [];

  if (users.some((user) => user.email === candidate.email)) {
    errors.push("email must be unique");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const user = {
    id: randomUUID(),
    created_at: new Date().toISOString(),
    ...candidate
  };
  users = [...users, user];

  return { ok: true, user };
};

const updateUsers = (searchParams, changes, options = { validate: true }) => {
  const filters = parseFilters(searchParams);
  const matches = users.filter((user) => matchesFilter(user, filters));

  if (matches.length === 0) {
    return { ok: true, users: [] };
  }

  const updatedUsers = [];

  users = users.map((user) => {
    if (!matchesFilter(user, filters)) {
      return user;
    }

    const nextUser = {
      ...user,
      ...Object.fromEntries(Object.entries(changes).map(([key, value]) => [key, String(value)]))
    };

    const errors = options.validate ? validateUserInput(nextUser, { requireAllFields: false }) : [];

    if (nextUser.email !== user.email && users.some((entry) => entry.id !== user.id && entry.email === nextUser.email)) {
      errors.push("email must be unique");
    }

    if (errors.length > 0) {
      throw Object.assign(new Error("validation"), { statusCode: 400, errors });
    }

    updatedUsers.push(nextUser);
    return nextUser;
  });

  return { ok: true, users: updatedUsers };
};

const deleteUsers = (searchParams) => {
  const filters = parseFilters(searchParams);
  const deleted = users.filter((user) => matchesFilter(user, filters));
  users = users.filter((user) => !matchesFilter(user, filters));
  return deleted;
};

const rosterMarkup = () =>
  users
    .map((user) => `<li>${fullName(user)} - ${user.role}</li>`)
    .join("");

const page = () => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>QA Lab Portal</title>
    <style>
      :root {
        --bg: #f7efe1;
        --panel: #fff9f0;
        --ink: #14213d;
        --accent: #ef476f;
        --accent-2: #118ab2;
        --ok: #1f7a4d;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Georgia, "Times New Roman", serif;
        background: radial-gradient(circle at top, #fff8ea 0%, var(--bg) 55%, #e7dcc7 100%);
        color: var(--ink);
      }
      main {
        max-width: 980px;
        margin: 0 auto;
        padding: 40px 20px 60px;
      }
      .hero, .panel {
        background: color-mix(in srgb, var(--panel) 86%, white 14%);
        border: 2px solid rgba(20, 33, 61, 0.12);
        border-radius: 24px;
        box-shadow: 0 20px 50px rgba(20, 33, 61, 0.08);
      }
      .hero {
        padding: 36px;
        margin-bottom: 24px;
      }
      h1 {
        margin: 0 0 12px;
        font-size: clamp(2rem, 4vw, 4rem);
      }
      .lede {
        font-size: 1.15rem;
        max-width: 40rem;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 16px;
        margin-bottom: 24px;
      }
      .card, .panel {
        padding: 20px;
      }
      .card {
        background: rgba(255, 255, 255, 0.7);
        border-radius: 18px;
        border: 1px solid rgba(20, 33, 61, 0.12);
      }
      form {
        display: grid;
        gap: 12px;
      }
      input, textarea, button {
        font: inherit;
        padding: 12px 14px;
        border-radius: 12px;
        border: 1px solid rgba(20, 33, 61, 0.2);
      }
      button {
        background: linear-gradient(135deg, var(--accent), var(--accent-2));
        color: white;
        border: none;
        cursor: pointer;
      }
      ul {
        margin: 0;
        padding-left: 18px;
      }
      [data-testid="contact-success"] {
        min-height: 1.5rem;
        color: var(--ok);
        font-weight: 700;
      }
      [data-testid="challenge-title"] {
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--accent);
        font-weight: 700;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <p>Screenplay Demo</p>
        <p data-testid="challenge-title">Spot the bugs challenge</p>
        <h1 data-testid="hero-title">QA Lab Portal</h1>
        <p class="lede">
          A lightweight training app for UI and API automation. It ships with seeded data,
          a contact workflow, and a roster endpoint for representative Playwright coverage.
        </p>
      </section>

      <section class="grid">
        <article class="card" data-testid="module-card">
          <h2>UI flows</h2>
          <p>Exercise navigation, form submission, and content assertions.</p>
        </article>
        <article class="card" data-testid="module-card">
          <h2>API checks</h2>
          <p>Exercise CRUD calls with persisted in-memory state.</p>
        </article>
        <article class="card" data-testid="module-card">
          <h2>Readable tests</h2>
          <p>Use Actors, Tasks, Interactions, Questions, and Abilities.</p>
        </article>
      </section>

      <section class="panel" aria-labelledby="contact-heading">
        <h2 id="contact-heading">Contact the QA lab</h2>
        <form id="contact-form">
          <input id="contact-name" name="name" placeholder="Your name" />
          <input id="contact-email" name="email" type="email" placeholder="name@example.com" />
          <textarea id="contact-message" name="message" rows="4" placeholder="What do you want to automate?"></textarea>
          <button type="submit" data-testid="send-contact">Send request</button>
        </form>
        <p data-testid="contact-success" aria-live="polite"></p>
      </section>

      <section class="panel" aria-labelledby="roster-heading" style="margin-top: 24px;">
        <h2 id="roster-heading">Current roster</h2>
        <ul id="roster-list" data-testid="roster-list">${rosterMarkup()}</ul>
      </section>
    </main>

    <script>
      const rosterList = document.getElementById("roster-list");
      const contactForm = document.getElementById("contact-form");
      const contactSuccess = document.querySelector('[data-testid="contact-success"]');

      async function loadRoster() {
        const response = await fetch("/api/users");
        const payload = await response.json();
        rosterList.innerHTML = payload
          .map((user) => "<li>" + user.first_name + " " + user.last_name + " - " + user.role + "</li>")
          .join("");
      }

      contactForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const formData = new FormData(contactForm);
        const payload = {
          name: formData.get("name"),
          email: formData.get("email"),
          message: formData.get("message")
        };

        const response = await fetch("/api/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const result = await response.json();
        contactSuccess.textContent = result.message;
        contactForm.reset();
      });

      loadRoster();
    </script>
  </body>
</html>`;

const handleUsersGet = (response, searchParams) => {
  json(response, 200, applyFilters(users, searchParams));
};

const handleUsersPost = async (request, response) => {
  const rawBody = await readBody(request);
  const payload = JSON.parse(rawBody || "{}");
  const result = createUser(payload);

  if (!result.ok) {
    json(response, 400, { message: result.errors.join(", ") });
    return;
  }

  json(response, 201, [result.user]);
};

const handleUsersPatch = async (request, response, searchParams) => {
  try {
    const rawBody = await readBody(request);
    const payload = JSON.parse(rawBody || "{}");
    const result = updateUsers(searchParams, payload);

    if ((request.headers.prefer || "").includes("return=representation")) {
      json(response, 200, result.users);
      return;
    }

    noContent(response);
  } catch (error) {
    json(response, error.statusCode || 500, { message: (error.errors || ["Unexpected error"]).join(", ") });
  }
};

const handleUsersDelete = (response, searchParams) => {
  deleteUsers(searchParams);
  noContent(response);
};

const handleDbMeta = (response) => {
  json(response, 200, {
    columns: userColumns,
    indexes: userIndexes
  });
};

const handleDbUsersPost = async (request, response) => {
  const rawBody = await readBody(request);
  const payload = JSON.parse(rawBody || "{}");
  const result = createUser(payload, { validate: false });

  if (!result.ok) {
    json(response, 400, { message: result.errors.join(", ") });
    return;
  }

  json(response, 201, result.user);
};

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${port}`);

  if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/qa-lab")) {
    send(response, 200, page(), { "Content-Type": "text/html; charset=utf-8" });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/health") {
    json(response, 200, { status: "ok" });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/users") {
    handleUsersGet(response, url.searchParams);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/users") {
    await handleUsersPost(request, response);
    return;
  }

  if (request.method === "PATCH" && url.pathname === "/api/users") {
    await handleUsersPatch(request, response, url.searchParams);
    return;
  }

  if (request.method === "DELETE" && url.pathname === "/api/users") {
    handleUsersDelete(response, url.searchParams);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/admin/users") {
    if (request.headers["x-api-key"] !== adminApiKey) {
      json(response, 401, { message: "Unauthorized" });
      return;
    }

    json(response, 200, applyFilters(users, url.searchParams));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/db/users") {
    handleUsersGet(response, url.searchParams);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/db/users") {
    await handleDbUsersPost(request, response);
    return;
  }

  if (request.method === "PATCH" && url.pathname === "/api/db/users") {
    try {
      const rawBody = await readBody(request);
      const payload = JSON.parse(rawBody || "{}");
      const result = updateUsers(url.searchParams, payload, { validate: false });
      json(response, 200, result.users);
    } catch (error) {
      json(response, error.statusCode || 500, { message: (error.errors || ["Unexpected error"]).join(", ") });
    }
    return;
  }

  if (request.method === "DELETE" && url.pathname === "/api/db/users") {
    json(response, 200, deleteUsers(url.searchParams));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/db/meta") {
    handleDbMeta(response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/contact") {
    const rawBody = await readBody(request);
    const payload = JSON.parse(rawBody || "{}");
    contactMessages.push(payload);
    json(response, 200, {
      message: `Thanks, ${payload.name}. Your automation request is queued.`
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/reset") {
    resetState();
    json(response, 200, { reset: true });
    return;
  }

  json(response, 404, { error: "Not found" });
});

server.listen(port, () => {
  console.log(`QA Lab demo app listening on http://127.0.0.1:${port}`);
});
