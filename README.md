# tools.daniboygg.dev

A collection of online tools mostly generated with LLMs. Inspired by [Simon Willison's tools](https://tools.simonwillison.net/).

## Local Development

This will automatically reload your browser when any HTML, CSS, or JS files change.

Install browser-sync and run from root directory:
```bash
npm install -g browser-sync
browser-sync start --server --files "*.html, **/*.html, **/*.css, **/*.js"
```