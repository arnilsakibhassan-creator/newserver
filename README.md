# Nola Template Manager v2

A small Express project with:

- `/approval-nola-team` admin GUI
- CORS origin add/delete manager
- WIN and MAC HTML uploaders
- Required description for each upload
- Filename, description and update time shown in the GUI
- Templates loaded into RAM at startup
- Each successful upload immediately re-encrypts that template and replaces the RAM cipher
- `/data?platform=win` and `/data?platform=mac` return only `{ "cipher": "..." }`

## Structure

```text
nola-template-manager-v2/
├── server.js
├── package.json
├── cors-origins.json
├── template-meta.json
├── README.md
├── admin/
│   ├── index.html
│   ├── app.js
│   └── styles.css
└── templates/
    ├── win-template.html
    └── mac-template.html
```

## Run

```bash
npm install
export PASSPHRASE='replace-with-your-secret'
npm start
```

Open:

```text
http://SERVER-IP:8080/approval-nola-team
```

## Important change in v2

The admin page JavaScript is no longer embedded inside a JavaScript template string in `server.js`. It is served as a separate `admin/app.js` file, which prevents the browser-side parsing issue that caused the page to stay on `Loading...` and prevented the WIN/MAC upload cards from rendering.
