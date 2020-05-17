
const child_process = require('child_process');
const fs = require('fs')
const path = require('path')
const os = require('os')

const { capitalCase } = require('change-case')

const DEV_NULL = '/dev/null'
const FILE_CHANGE_TYPES = {
  CREATION: 'CREATION',
  DELETION: 'DELETION',
  MODIFICATION: 'MODIFICATION',
  NONE: 'NONE'
}
const PARTICIPLE_MAP = new Map([
  [FILE_CHANGE_TYPES.CREATION, 'Created'],
  [FILE_CHANGE_TYPES.DELETION, 'Deleted'],
  [FILE_CHANGE_TYPES.MODIFICATION, 'Modified'],
  [FILE_CHANGE_TYPES.NONE, 'Unmodified']
])

async function getConsolidatedFileChangesBetweenDirectories (directories, startWithEmptyDirectory = true) {
  const allFileChanges = []
  if (startWithEmptyDirectory) {
    const emptyDir = fs.mkdtempSync(`${os.tmpdir()}${path.sep}`)
    allFileChanges.push(await getFileChangesBetweenDirectories(emptyDir, directories[0]))
    fs.rmdirSync(emptyDir)
  }
  // TODO replace with async.eachOf?
  for ( let i = 1 ; i < directories.length ; i++ ) {
    const a = directories[i-1]
    const b = directories[i]
    allFileChanges.push(await getFileChangesBetweenDirectories(a, b))
  }
  return consolidateFileChanges(allFileChanges)
}

async function getFileChangesBetweenDirectories (a, b) {
  const diff = await getDiff(a, b)
  return diff.split('\n').map(diffLine => {
    return parseFileChangeFromDiffLine(diffLine, `${a}${path.sep}`, `${b}${path.sep}`)
  }).sort(fileChangesSorter)
}

/**
 * Get the numstat diff between two directories.
 * @param {string} a - the 'before' directory
 * @param {string} b - the 'after' directory
 * @returns {Promise<string>}
 */
async function getDiff (a, b) {
  const command = `git diff --numstat --no-index --no-renames ${a} ${b}`
  return new Promise((resolve, reject) => {
    child_process.exec(command, (_, stdout, stderr) => {
      if (stderr) return reject(stderr.trim())
      resolve(stdout.trim())
    })
  })
}

function parseFileChangeFromDiffLine (diffLine, aBasePath, bBasePath) {
  const parts = diffLine.split('\t')
  const additions = parseInt(parts[0])
  const deletions = parseInt(parts[1])
  const [ _, prefix, aSubPath, bSubPath, postfix ] = parts[2].match(/(.*){(.*) => (.*)}(.*)/);
  const aFile = `${prefix}${aSubPath}${postfix}`
  const bFile = `${prefix}${bSubPath}${postfix}`
  if ( aFile === DEV_NULL ) {
    return {
      filename: bFile.substring(bBasePath.length),
      change: {
        type: FILE_CHANGE_TYPES.CREATION,
        additions,
        deletions
      }
    }
  } else if ( bFile === DEV_NULL) {
    return {
      filename: aFile.substring(aBasePath.length),
      change: {
        type: FILE_CHANGE_TYPES.DELETION,
        additions,
        deletions
      }
    }
  } else {
    return {
      filename: aFile.substring(aBasePath.length),
      change: {
        type: FILE_CHANGE_TYPES.MODIFICATION,
        additions,
        deletions
      }
    }
  }
}

function consolidateFileChanges (allFileChanges) {
  let filenames = new Set()
  allFileChanges.forEach(fileChanges => {
    sortFileChanges(fileChanges)
    fileChanges.forEach(fileChange => {
      filenames.add(fileChange.filename)
    })
  })
  return Array.from(filenames).sort().map(filename => {
    return allFileChanges.reduce(( consolidatedFileChange, fileChanges ) => {
      const { changes } = consolidatedFileChange
      const fileChange = fileChanges.find(fileChange => {
        return fileChange.filename === filename
      })
      if (fileChange) {
        changes.push(fileChange.change)
      } else {
        if (
          changes.length > 0 &&
          changes[changes.length-1] && (
            changes[changes.length-1].type === FILE_CHANGE_TYPES.CREATION ||
            changes[changes.length-1].type === FILE_CHANGE_TYPES.NONE
          )
        ) {
          changes.push({
            type: FILE_CHANGE_TYPES.NONE
          })
        } else {
          changes.push(null)
        }
      }
      return consolidatedFileChange
    }, { filename, changes: [] })
  }).sort(fileChangesSorter)
}

function sortFileChanges (fileChanges) {
  fileChanges.sort(fileChangesSorter)
}

function fileChangesSorter (a, b) {
  return a.filename.localeCompare(b.filename)
}

const HtmlRenderer = (function () {
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

  function renderDocument (consolidatedFileChanges, groupByFolder = false) {
    return `<!doctype html>
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
    </html>`
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
      <td class="filename">
        ${consolidatedFileChange.filename}
      </td>
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
    return `<td class="additions ${changeType.toLowerCase()}">
      <span class="${ additions > 0 ? 'some-additions' : 'no-additions' }">${additions||0}</span>
    </td>`
  }

  function renderDeletions (deletions, changeType) {
    return `<td class="deletions ${changeType.toLowerCase()}">
      <span class="${ deletions > 0 ? 'some-deletions' : 'no-deletions' }">${deletions||0}</span>
    </td>`
  }

  return { renderDocument }
})()

module.exports = {
  getConsolidatedFileChangesBetweenDirectories,
  HtmlRenderer
}
