# ddcr

a directory diff/change renderer.

use this package to visualize file changes between directories.

## requirements

currently, the `git` program must be available on the path.

## installation

```shell script
npm install ddcr
```

## example usage

```javascript
const {
  getConsolidatedFileChangesBetweenDirectories,
  HtmlRenderer
} = require('ddcr')

const directories = [
  '/path/to/folder/one',
  '/path/to/folder/two'
  // as many folders as you want
]

const changes = getConsolidatedFileChangesBetweenDirectories(directories)

const html = HtmlRenderer.renderDocument(changes)
```