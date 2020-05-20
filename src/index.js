
const Differ = require('./Differ')

const HtmlRenderer = require('./HtmlRenderer')

module.exports = {
  getConsolidatedFileChangesBetweenDirectories: Differ.getConsolidatedFileChangesBetweenDirectories,
  Differ,
  HtmlRenderer
}
