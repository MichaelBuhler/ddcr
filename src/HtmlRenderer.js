
const path = require('path')

const { capitalCase } = require('change-case')
const prettier = require('prettier')

const { FILE_CHANGE_TYPES } = require('./constants')

const PARTICIPLE_MAP = new Map([
  [FILE_CHANGE_TYPES.CREATION, 'Created'],
  [FILE_CHANGE_TYPES.DELETION, 'Deleted'],
  [FILE_CHANGE_TYPES.MODIFICATION, 'Modified'],
  [FILE_CHANGE_TYPES.NONE, 'Unmodified']
])

const DEFAULT_TITLE = 'Directory Diff/Change Renderer'
const DEFAULT_STYLES = `table {
    border-collapse: collapse;
    border-width: 0;
  }
  td {
    padding: 4px 12px;
  }
  td.additions,
  td.deletions {
    text-align: right;
  }
  td.creation {
    background-color: #eeffee;
  }
  td.deletion {
    background-color: #ffeeee;
  }
  td.modification {
    background-color: #eeeeee;
  }
  span.some-additions,
  td.change.creation {
    color: #28a745;
  }
  span.some-additions:before,
  span.no-additions:before {
    content: '+';
  }
  span.some-deletions,
  td.change.deletion {
    color: #cb2431;
  }
  span.some-deletions:before,
  span.no-deletions:before {
    content: '-';
  }
  td.change.none,
  span.no-additions,
  span.no-deletions {
    color: #888888;
  }`

const PRETTIER_OPTIONS = {
  parser: 'html',
  printWidth: 120
}

function renderDocument (consolidatedFileChanges, groupByFolder = false) {
  return prettier.format(`<!doctype html>
  <html lang="en">
    <head>
      <title>${DEFAULT_TITLE}</title>
      <style> 
        ${ DEFAULT_STYLES }
      </style>
    </head>
    <body>
      <h1>${DEFAULT_TITLE}</h1>
      ${ renderTable(consolidatedFileChanges, groupByFolder) }
    </body>
  </html>`, PRETTIER_OPTIONS)
}

function renderTable (consolidatedFileChanges, groupByFolder) {
  if (groupByFolder) {
    const consolidatedFileChangesByFolder = {}
    const consolidatedFileChangesInRootFolder = []
    consolidatedFileChanges.forEach(consolidatedFileChange => {
      const index = consolidatedFileChange.filename.indexOf(path.sep);
      if ( index === -1 ) {
        consolidatedFileChangesInRootFolder.push(consolidatedFileChange)
      } else {
        const folder = consolidatedFileChange.filename.substring(0, index)
        consolidatedFileChange.filename = consolidatedFileChange.filename.substring(index+1)
        consolidatedFileChangesByFolder[folder] = consolidatedFileChangesByFolder[folder] || []
        consolidatedFileChangesByFolder[folder].push(consolidatedFileChange)
      }
    })
    return `<table>
      ${ consolidatedFileChangesInRootFolder.map(renderConsolidatedFileChange).join('\n') }
      ${ Object.entries(consolidatedFileChangesByFolder).map(([folder, consolidatedFileChanges]) => {
      return renderSection(capitalCase(folder), consolidatedFileChanges)
    }).join('\n') }
    </table>`
  }
  return `<table>
    ${ consolidatedFileChanges.map(renderConsolidatedFileChange).join('\n') }
  </table>`
}

function renderSection (sectionName, consolidatedFileChanges) {
  return `<tr>
    <td><h3>${sectionName}</h3></td>
  </tr>
  ${ consolidatedFileChanges.map(renderConsolidatedFileChange).join('\n') }`
}

function renderConsolidatedFileChange (consolidatedFileChange) {
  return `<tr>
    <td class="filename">${consolidatedFileChange.filename}</td>
    ${ consolidatedFileChange.changes.map(renderChange).join('\n') }
  </tr>`
}

function renderChange (change) {
  if (!change) {
    return '<td class="change null" colspan="3"/>'
  }
  return `<td class="change ${change.type.toLowerCase()}">${PARTICIPLE_MAP.get(change.type)}</td>
  ${ renderAdditions(change.additions, change.type) }
  ${ renderDeletions(change.deletions, change.type) }`
}

function renderAdditions (additions, changeType) {
  return `<td class="additions ${changeType.toLowerCase()}">\
    <span class="${ additions > 0 ? 'some-additions' : 'no-additions' }">${additions||0}</span>\
  </td>`
}

function renderDeletions (deletions, changeType) {
  return `<td class="deletions ${changeType.toLowerCase()}">\
    <span class="${ deletions > 0 ? 'some-deletions' : 'no-deletions' }">${deletions||0}</span>\
  </td>`
}

module.exports = {
  renderDocument
}
