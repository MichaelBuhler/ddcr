
const child_process = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

const { FILE_CHANGE_TYPES } = require('./constants')

const DEV_NULL = '/dev/null'

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
  if (!diff) return []
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

module.exports = {
  getConsolidatedFileChangesBetweenDirectories
}
